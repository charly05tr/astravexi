from django.db import IntegrityError, transaction

from crew.models import CrewProfile
from crew.services import APPLIED, FORBIDDEN, REJECTED_FUTURE, STALE, is_too_far_in_future

from .models import SyncRecord


def _update_existing(record: SyncRecord, data) -> str:
    if data["client_updated_at"] <= record.client_updated_at:
        return STALE
    for field, value in data.items():
        setattr(record, field, value)
    record.save()
    return APPLIED


def upsert_record(device, profile_id: str, data) -> str:
    """Last-write-wins upsert of one record, scoped to `device`. Returns an item status.

    A profile that does not exist and one owned by another device are indistinguishable (`forbidden`).
    Must be called inside a transaction; the first insert runs in a savepoint and a lost race is retried once
    as a locked get-and-update.
    """
    if is_too_far_in_future(data["client_updated_at"]):
        return REJECTED_FUTURE
    if not CrewProfile.objects.filter(pk=profile_id, device=device).exists():
        return FORBIDDEN

    lookup = {"profile_id": profile_id, "kind": data["kind"], "client_id": data["client_id"]}
    record = SyncRecord.objects.select_for_update().filter(**lookup).first()
    if record is None:
        try:
            with transaction.atomic():
                SyncRecord.objects.create(profile_id=profile_id, **data)
            return APPLIED
        except IntegrityError:
            record = SyncRecord.objects.select_for_update().get(**lookup)
    return _update_existing(record, data)
