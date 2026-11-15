import base64
import binascii
import json
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils.dateparse import parse_datetime
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from crew.models import CrewProfile
from crew.serializers import CrewProfileSerializer
from crew.services import upsert_profile

from .models import SyncRecord
from .serializers import SyncRecordSerializer
from .services import upsert_record


class PushSerializer(serializers.Serializer):
    profiles = CrewProfileSerializer(many=True, required=False, default=list)
    records = SyncRecordSerializer(many=True, required=False, default=list)


class SyncPushView(APIView):
    def post(self, request):
        body = PushSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        device = request.user
        profile_results, record_results = [], []

        # Malformed items reject the whole batch (400). Per-item outcomes never do: each item gets a status
        # (applied | stale | forbidden | rejected_future) and one item cannot reveal another device's data.
        with transaction.atomic():
            for data in body.validated_data["profiles"]:
                status = upsert_profile(device, data)
                profile_results.append({"id": data["id"], "status": status})

            for data in body.validated_data["records"]:
                profile_id = data.pop("profile_id")
                status = upsert_record(device, profile_id, data)
                record_results.append(
                    {"profile": profile_id, "kind": data["kind"], "client_id": data["client_id"], "status": status}
                )

        return Response({"profiles": profile_results, "records": record_results})


# --- Pull -------------------------------------------------------------------------------------------------


def _encode_cursor(state: dict) -> str:
    raw = json.dumps(state, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _valid_position(pos, pk_type) -> bool:
    return (
        pos is None
        or (
            isinstance(pos, list)
            and len(pos) == 2
            and isinstance(pos[0], str)
            and parse_datetime(pos[0]) is not None
            and isinstance(pos[1], pk_type)
            and not isinstance(pos[1], bool)
        )
    )


def _decode_cursor(value: str) -> dict:
    try:
        state = json.loads(base64.urlsafe_b64decode(value + "=" * (-len(value) % 4)))
        if not isinstance(state, dict):
            raise ValueError
        if not (_valid_position(state.get("p"), str) and _valid_position(state.get("r"), int)):
            raise ValueError
        for key in ("s", "m"):
            if state.get(key) is not None and parse_datetime(state[key]) is None:
                raise ValueError
        return state
    except (ValueError, binascii.Error, TypeError, UnicodeDecodeError):
        raise serializers.ValidationError({"cursor": "Invalid cursor."}) from None


def _parse_since(raw: str):
    # A raw "+00:00" offset arrives with the "+" turned into a space by URL decoding.
    try:
        since = parse_datetime(raw.replace(" ", "+"))
    except ValueError:
        since = None
    if since is None or since.tzinfo is None:
        raise serializers.ValidationError({"since": "Expected an ISO 8601 datetime with a timezone."})
    return since


def _page(queryset, lower, position, limit):
    """Keyset page ordered by (server_updated_at, pk). Returns (rows, has_more, new_position)."""
    if lower is not None:
        queryset = queryset.filter(server_updated_at__gte=lower)
    if position is not None:
        ts, pk = parse_datetime(position[0]), position[1]
        queryset = queryset.filter(Q(server_updated_at__gt=ts) | Q(server_updated_at=ts, pk__gt=pk))
    rows = list(queryset.order_by("server_updated_at", "pk")[: limit + 1])
    has_more = len(rows) > limit
    rows = rows[:limit]
    new_position = [rows[-1].server_updated_at.isoformat(), rows[-1].pk] if rows else position
    return rows, has_more, new_position


class SyncPullView(APIView):
    """See backend/README.md ("Pull") for the contract."""

    def get(self, request):
        params = request.query_params
        limit = self._limit(params.get("limit"))

        if params.get("cursor"):
            state = _decode_cursor(params["cursor"])
            lower = parse_datetime(state["s"]) if state.get("s") else None
            running = parse_datetime(state["m"]) if state.get("m") else None
            positions = {"p": state.get("p"), "r": state.get("r")}
        else:
            lower = running = None
            if params.get("since"):
                running = _parse_since(params["since"])
                lower = running - timedelta(seconds=settings.SYNC_PULL_OVERLAP_SECONDS)
            positions = {"p": None, "r": None}

        profiles = CrewProfile.objects.filter(device=request.user)
        records = SyncRecord.objects.filter(profile__device=request.user)
        profile_id = params.get("profile")
        if profile_id:
            profiles = profiles.filter(pk=profile_id)
            records = records.filter(profile_id=profile_id)

        p_rows, p_more, p_pos = _page(profiles, lower, positions["p"], limit)
        r_rows, r_more, r_pos = _page(records, lower, positions["r"], limit)
        has_more = p_more or r_more

        # Newest server timestamp seen across the whole (possibly multi-page) pull: what the client stores.
        seen = [t for t in [running, *(o.server_updated_at for o in p_rows + r_rows)] if t is not None]
        next_since = max(seen) if seen else None
        field = serializers.DateTimeField()
        cursor = None
        if has_more:
            cursor = _encode_cursor(
                {
                    "s": lower.isoformat() if lower else None,
                    "m": next_since.isoformat() if next_since else None,
                    "p": p_pos,
                    "r": r_pos,
                }
            )

        return Response(
            {
                "profiles": CrewProfileSerializer(p_rows, many=True).data,
                "records": SyncRecordSerializer(r_rows, many=True).data,
                "has_more": has_more,
                "next_cursor": cursor,
                "next_since": field.to_representation(next_since) if next_since else None,
            }
        )

    @staticmethod
    def _limit(raw):
        if raw in (None, ""):
            return settings.SYNC_PULL_DEFAULT_LIMIT
        try:
            value = int(raw)
        except ValueError:
            raise serializers.ValidationError({"limit": "Expected a positive integer."}) from None
        if value < 1:
            raise serializers.ValidationError({"limit": "Expected a positive integer."})
        return min(value, settings.SYNC_PULL_MAX_LIMIT)
