import base64
import json
import threading
from datetime import timedelta
from unittest import mock

from django.db import IntegrityError, connection, transaction
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from crew.models import CrewProfile
from crew.services import upsert_profile
from devices.models import Device
from devices.services import create_enrollment_code, enroll_device

from .models import SyncRecord
from .services import upsert_record

T1 = "2026-01-01T10:00:00Z"
T2 = "2026-01-01T11:00:00Z"
T3 = "2026-01-01T12:00:00Z"


def make_device(name="Device"):
    code, _ = create_enrollment_code()
    return enroll_device(code, name)


def profile(id="p1", updated_at=T1, name="Ada"):
    return {"id": id, "name": name, "role": "astronaut", "created_at": T1, "updated_at": updated_at, "deleted": False}


def record(client_id="r1", updated_at=T1, value=1, profile_id="p1", kind="manualReading"):
    return {
        "profile": profile_id,
        "kind": kind,
        "client_id": client_id,
        "payload": {"value": value},
        "client_updated_at": updated_at,
        "deleted": False,
    }


class ApiBase(TestCase):
    def setUp(self):
        self.device, self.token = make_device()

    def auth(self, token="__own__"):
        token = self.token if token == "__own__" else token
        return {"HTTP_AUTHORIZATION": f"Device {token}"} if token else {}

    def push(self, profiles=(), records=(), token="__own__"):
        return self.client.post(
            "/api/sync/push/",
            {"profiles": list(profiles), "records": list(records)},
            content_type="application/json",
            **self.auth(token),
        )

    def pull(self, query="", token="__own__"):
        return self.client.get(f"/api/sync/pull/{query}", **self.auth(token))


class AuthTests(ApiBase):
    def test_health_is_public(self):
        res = self.client.get("/api/health/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"status": "ok"})

    def test_device_token_is_required(self):
        for token in (None, "wrong", "x" * 300, "café-☃"):
            self.assertEqual(self.pull(token=token).status_code, 401, token)
        self.assertEqual(self.push(token=None).status_code, 401)
        self.assertEqual(self.client.get("/api/profiles/").status_code, 401)
        self.assertEqual(self.pull().status_code, 200)

    def test_other_schemes_are_rejected(self):
        res = self.client.get("/api/sync/pull/", HTTP_AUTHORIZATION=f"Bearer {self.token}")
        self.assertEqual(res.status_code, 401)
        res = self.client.get("/api/sync/pull/", HTTP_X_DEVICE_KEY=self.token)
        self.assertEqual(res.status_code, 401)

    def test_revoked_device_is_rejected(self):
        Device.objects.filter(pk=self.device.pk).update(revoked=True)
        self.assertEqual(self.pull().status_code, 401)

    def test_last_seen_is_updated_but_throttled(self):
        self.assertIsNone(Device.objects.get().last_seen_at)
        self.pull()
        first = Device.objects.get().last_seen_at
        self.assertIsNotNone(first)
        self.pull()
        self.assertEqual(Device.objects.get().last_seen_at, first)
        Device.objects.update(last_seen_at=first - timedelta(hours=1))
        self.pull()
        self.assertGreater(Device.objects.get().last_seen_at, first - timedelta(minutes=1))


class SyncTests(ApiBase):
    def test_push_upserts_profiles_and_records(self):
        res = self.push([profile()], [record()])
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["profiles"], [{"id": "p1", "status": "applied"}])
        self.assertEqual(res.json()["records"][0]["status"], "applied")
        self.assertEqual(CrewProfile.objects.get().device_id, self.device.id)
        self.assertEqual(SyncRecord.objects.get().payload, {"value": 1})

        res = self.push([], [record(updated_at=T2, value=2)])
        self.assertEqual(res.json()["records"][0]["status"], "applied")
        self.assertEqual(SyncRecord.objects.count(), 1)
        self.assertEqual(SyncRecord.objects.get().payload, {"value": 2})

    def test_stale_write_is_rejected(self):
        self.push([profile(updated_at=T2, name="New")], [record(updated_at=T2, value=2)])
        res = self.push([profile(updated_at=T1, name="Old")], [record(updated_at=T1, value=1)])
        self.assertEqual(res.json()["profiles"][0]["status"], "stale")
        self.assertEqual(res.json()["records"][0]["status"], "stale")
        self.assertEqual(CrewProfile.objects.get().name, "New")
        self.assertEqual(SyncRecord.objects.get().payload, {"value": 2})

    def test_record_for_unknown_profile_is_forbidden(self):
        res = self.push([profile()], [record(profile_id="missing")])
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["profiles"][0]["status"], "applied")
        self.assertEqual(res.json()["records"][0]["status"], "forbidden")
        self.assertEqual(SyncRecord.objects.count(), 0)

    def test_malformed_item_rejects_the_whole_batch(self):
        bad = record()
        del bad["kind"]
        res = self.push([profile()], [bad])
        self.assertEqual(res.status_code, 400)
        self.assertEqual(CrewProfile.objects.count(), 0)

    def test_future_timestamps_are_rejected(self):
        future = (timezone.now() + timedelta(minutes=10)).isoformat()
        soon = (timezone.now() + timedelta(minutes=2)).isoformat()
        res = self.push([profile("p1", updated_at=future), profile("p2", updated_at=soon)], [])
        self.assertEqual([p["status"] for p in res.json()["profiles"]], ["rejected_future", "applied"])
        res = self.push(
            [], [record(updated_at=future, profile_id="p2"), record("r2", updated_at=soon, profile_id="p2")]
        )
        self.assertEqual([r["status"] for r in res.json()["records"]], ["rejected_future", "applied"])
        self.assertEqual(SyncRecord.objects.count(), 1)
        self.assertFalse(CrewProfile.objects.filter(pk="p1").exists())

    def test_future_item_cannot_poison_later_writes(self):
        self.push([profile(updated_at=T1)], [])
        future = (timezone.now() + timedelta(days=3650)).isoformat()
        self.push([profile(updated_at=future, name="Poison")], [])
        res = self.push([profile(updated_at=T2, name="Legit")], [])
        self.assertEqual(res.json()["profiles"][0]["status"], "applied")
        self.assertEqual(CrewProfile.objects.get().name, "Legit")

    @override_settings(SYNC_MAX_FUTURE_SKEW_SECONDS=0)
    def test_future_skew_is_configurable(self):
        soon = (timezone.now() + timedelta(minutes=1)).isoformat()
        res = self.push([profile(updated_at=soon)], [])
        self.assertEqual(res.json()["profiles"][0]["status"], "rejected_future")

    def test_pull_returns_everything_then_changes_after_since(self):
        self.push([profile()], [record("r1")])
        first = self.pull().json()
        self.assertEqual(len(first["profiles"]), 1)
        self.assertEqual(len(first["records"]), 1)
        self.assertFalse(first["has_more"])
        self.assertIsNone(first["next_cursor"])
        since = first["next_since"]
        self.assertIsNotNone(since)

        # Nothing new: the overlap re-delivers the boundary row (clients upsert by id) and since is stable.
        again = self.pull(f"?since={since}").json()
        self.assertEqual([r["client_id"] for r in again["records"]], ["r1"])
        self.assertEqual(again["next_since"], since)

        self.push([], [record("r2", updated_at=T2)])
        changed = self.pull(f"?since={since}").json()
        self.assertEqual([r["client_id"] for r in changed["records"]], ["r1", "r2"])
        self.assertGreater(parse_datetime(changed["next_since"]), parse_datetime(since))

    def test_pull_empty(self):
        data = self.pull().json()
        self.assertEqual(
            (data["profiles"], data["records"], data["next_since"], data["has_more"]), ([], [], None, False)
        )

    @override_settings(SYNC_PULL_OVERLAP_SECONDS=120)
    def test_since_overlap_reincludes_recent_rows_but_not_old_ones(self):
        self.push([profile()], [])
        p1 = CrewProfile.objects.get(pk="p1")
        base = parse_datetime("2026-03-01T12:00:00Z")
        for cid, offset in (("old", -300), ("late", -60), ("at", 0)):
            row = SyncRecord.objects.create(
                profile=p1, kind="manualReading", client_id=cid, payload={}, client_updated_at=parse_datetime(T1)
            )
            SyncRecord.objects.filter(pk=row.pk).update(server_updated_at=base + timedelta(seconds=offset))
        data = self.pull("?since=2026-03-01T12:00:00Z").json()
        # `late` carries a timestamp 60s before the cursor (inside the 120s window), `old` is outside it.
        self.assertEqual([r["client_id"] for r in data["records"]], ["late", "at"])

    def test_pagination_walks_all_rows_without_looping(self):
        ids = [f"r{i:02d}" for i in range(7)]
        self.push([profile("p1"), profile("p2")], [record(i) for i in ids])
        # All rows share one timestamp (order falls back to pk) and the overlap window is active on page one.
        stamp = parse_datetime("2026-03-01T12:00:00Z")
        SyncRecord.objects.update(server_updated_at=stamp)
        CrewProfile.objects.update(server_updated_at=stamp)

        seen_records, seen_profiles, pages = [], [], 0
        query = "?since=2026-03-01T12:00:00Z&limit=3"
        while True:
            data = self.pull(query).json()
            pages += 1
            self.assertLess(pages, 10, "pagination looped")
            seen_records += [r["client_id"] for r in data["records"]]
            seen_profiles += [p["id"] for p in data["profiles"]]
            if not data["has_more"]:
                self.assertIsNone(data["next_cursor"])
                break
            query = f"?cursor={data['next_cursor']}&limit=3"
        self.assertEqual(seen_records, ids)
        self.assertEqual(seen_profiles, ["p1", "p2"])
        self.assertEqual(pages, 3)
        self.assertEqual(data["next_since"], "2026-03-01T12:00:00Z")

    def test_pagination_without_since_and_limit_handling(self):
        self.push([profile()], [record(f"r{i}") for i in range(5)])
        data = self.pull("?limit=2").json()
        self.assertEqual(len(data["records"]), 2)
        self.assertTrue(data["has_more"])
        rest = self.pull(f"?cursor={data['next_cursor']}&limit=2").json()
        self.assertEqual(len(rest["records"]), 2)
        last = self.pull(f"?cursor={rest['next_cursor']}&limit=2").json()
        self.assertEqual(len(last["records"]), 1)
        self.assertFalse(last["has_more"])
        self.assertEqual(self.pull("?limit=0").status_code, 400)
        self.assertEqual(self.pull("?limit=abc").status_code, 400)
        with override_settings(SYNC_PULL_MAX_LIMIT=2):
            self.assertEqual(len(self.pull("?limit=999").json()["records"]), 2)

    def test_pull_rejects_bad_cursor_and_since(self):
        self.assertEqual(self.pull("?since=nope").status_code, 400)
        self.assertEqual(self.pull("?since=2026-01-01T10:00:00").status_code, 400)  # no timezone
        self.assertEqual(self.pull("?cursor=%25%25%25").status_code, 400)
        self.assertEqual(self.pull("?cursor=bm90anNvbg").status_code, 400)
        forged = base64.urlsafe_b64encode(json.dumps({"r": [T1, "not-an-int"]}).encode()).decode()
        self.assertEqual(self.pull(f"?cursor={forged}").status_code, 400)

    def test_pull_filters_by_profile_and_includes_tombstones(self):
        self.push(
            [profile("p1"), profile("p2")],
            [record("r1", profile_id="p1"), record("r2", profile_id="p2")],
        )
        gone = record("r1", updated_at=T2, profile_id="p1")
        gone["deleted"] = True
        self.push([], [gone])
        data = self.pull("?profile=p1").json()
        self.assertEqual([p["id"] for p in data["profiles"]], ["p1"])
        self.assertEqual([(r["client_id"], r["deleted"]) for r in data["records"]], [("r1", True)])

    def test_profiles_endpoint_lists_and_upserts(self):
        headers = self.auth()
        res = self.client.post("/api/profiles/", profile(), content_type="application/json", **headers)
        self.assertEqual(res.json()["status"], "applied")
        res = self.client.post(
            "/api/profiles/", profile(updated_at=T3, name="Grace"), content_type="application/json", **headers
        )
        self.assertEqual(res.json()["profile"]["name"], "Grace")
        listing = self.client.get("/api/profiles/", **headers).json()
        self.assertEqual([p["name"] for p in listing], ["Grace"])

    def test_unique_constraint_per_profile_kind_client_id(self):
        self.push([profile("p1"), profile("p2")], [record("r1", profile_id="p1")])
        p1 = CrewProfile.objects.get(pk="p1")
        stamp = parse_datetime(T1)
        with self.assertRaises(IntegrityError), transaction.atomic():
            SyncRecord.objects.create(
                profile=p1, kind="manualReading", client_id="r1", payload={}, client_updated_at=stamp
            )
        # Same client_id under another kind or another profile is allowed.
        SyncRecord.objects.create(profile=p1, kind="decision", client_id="r1", payload={}, client_updated_at=stamp)
        SyncRecord.objects.create(
            profile=CrewProfile.objects.get(pk="p2"),
            kind="manualReading",
            client_id="r1",
            payload={},
            client_updated_at=stamp,
        )
        self.assertEqual(SyncRecord.objects.count(), 3)


class OwnershipTests(ApiBase):
    def setUp(self):
        super().setUp()
        self.other, self.other_token = make_device("Other")

    def test_device_cannot_overwrite_a_profile_owned_by_another(self):
        self.push([profile("p1", name="Mine")], [record()])
        res = self.push([profile("p1", updated_at=T3, name="Hijack")], [], token=self.other_token)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["profiles"], [{"id": "p1", "status": "forbidden"}])
        self.assertEqual(CrewProfile.objects.get().name, "Mine")
        self.assertEqual(CrewProfile.objects.get().device_id, self.device.id)

    def test_device_cannot_write_records_to_another_devices_profile(self):
        self.push([profile("p1")], [])
        res = self.push([], [record(profile_id="p1", updated_at=T3)], token=self.other_token)
        self.assertEqual(res.json()["records"][0]["status"], "forbidden")
        self.assertEqual(SyncRecord.objects.count(), 0)

    def test_forbidden_does_not_distinguish_foreign_from_unknown_profile(self):
        self.push([profile("p1")], [])
        foreign = self.push([], [record(profile_id="p1")], token=self.other_token).json()["records"][0]["status"]
        unknown = self.push([], [record(profile_id="nope")], token=self.other_token).json()["records"][0]["status"]
        self.assertEqual(foreign, unknown)

    def test_pull_and_list_are_scoped_to_the_device(self):
        self.push([profile("p1")], [record("r1", profile_id="p1")])
        self.push([profile("p2")], [record("r2", profile_id="p2")], token=self.other_token)
        mine = self.pull().json()
        self.assertEqual([p["id"] for p in mine["profiles"]], ["p1"])
        self.assertEqual([r["client_id"] for r in mine["records"]], ["r1"])
        theirs = self.pull(token=self.other_token).json()
        self.assertEqual([p["id"] for p in theirs["profiles"]], ["p2"])
        # Asking for a foreign profile explicitly yields nothing.
        self.assertEqual(self.pull("?profile=p2").json()["profiles"], [])
        listing = self.client.get("/api/profiles/", **self.auth(self.other_token)).json()
        self.assertEqual([p["id"] for p in listing], ["p2"])

    def test_profiles_endpoint_forbids_foreign_profile(self):
        self.push([profile("p1")], [])
        res = self.client.post(
            "/api/profiles/",
            profile("p1", updated_at=T3, name="Hijack"),
            content_type="application/json",
            **self.auth(self.other_token),
        )
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.json(), {"status": "forbidden"})
        self.assertEqual(CrewProfile.objects.get().name, "Ada")


class ConcurrentInsertTests(TestCase):
    """A lost first-insert race (IntegrityError) is retried once as get-and-update instead of a 500."""

    def setUp(self):
        self.device, _ = make_device()

    def test_profile_insert_race_falls_back_to_update(self):
        data = {k: parse_datetime(v) if k.endswith("_at") else v for k, v in profile(updated_at=T2).items()}
        CrewProfile.objects.create(
            id="p1", device=self.device, name="Winner", role="astronaut",
            created_at=parse_datetime(T1), updated_at=parse_datetime(T1),
        )
        # The first read misses (the row was not committed yet), the insert then collides.
        with mock.patch("crew.services.CrewProfile.objects.select_for_update") as sfu:
            sfu.return_value.filter.return_value.first.return_value = None
            sfu.return_value.get.return_value = CrewProfile.objects.get(pk="p1")
            with transaction.atomic():
                status = upsert_profile(self.device, data)
        self.assertEqual(status, "applied")
        self.assertEqual(CrewProfile.objects.get().updated_at, parse_datetime(T2))

    def test_record_insert_race_falls_back_to_update(self):
        CrewProfile.objects.create(
            id="p1", device=self.device, name="Ada", role="astronaut",
            created_at=parse_datetime(T1), updated_at=parse_datetime(T1),
        )
        SyncRecord.objects.create(
            profile_id="p1", kind="manualReading", client_id="r1", payload={"value": 1},
            client_updated_at=parse_datetime(T1),
        )
        data = {
            "kind": "manualReading", "client_id": "r1", "payload": {"value": 2},
            "client_updated_at": parse_datetime(T2), "deleted": False,
        }
        existing = SyncRecord.objects.get()
        with mock.patch("records.services.SyncRecord.objects.select_for_update") as sfu:
            sfu.return_value.filter.return_value.first.return_value = None
            sfu.return_value.get.return_value = existing
            with transaction.atomic():
                status = upsert_record(self.device, "p1", data)
        self.assertEqual(status, "applied")
        self.assertEqual(SyncRecord.objects.get().payload, {"value": 2})


class RealConcurrencyTests(TransactionTestCase):
    def test_parallel_first_pushes_of_one_profile_never_error(self):
        device, token = make_device()
        errors, statuses = [], []
        barrier = threading.Barrier(4)

        def worker(n):
            try:
                barrier.wait()
                from django.test import Client

                res = Client().post(
                    "/api/sync/push/",
                    {"profiles": [profile("race", updated_at=f"2026-01-01T1{n}:00:00Z", name=f"w{n}")], "records": []},
                    content_type="application/json",
                    HTTP_AUTHORIZATION=f"Device {token}",
                )
                statuses.append(res.status_code)
            except Exception as exc:  # noqa: BLE001
                errors.append(exc)
            finally:
                connection.close()

        threads = [threading.Thread(target=worker, args=(n,)) for n in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(errors, [])
        self.assertEqual(statuses, [200] * 4)
        self.assertEqual(CrewProfile.objects.get(pk="race").name, "w3")
        self.assertEqual(Device.objects.get().id, device.id)


@override_settings(CORS_ALLOWED_ORIGINS=["https://app.example.com"])
class CorsTests(TestCase):
    def preflight(self, origin):
        return self.client.options(
            "/api/sync/pull/",
            HTTP_ORIGIN=origin,
            HTTP_ACCESS_CONTROL_REQUEST_METHOD="GET",
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS="authorization",
        )

    def test_preflight_from_allowed_origin_allows_authorization_header(self):
        res = self.preflight("https://app.example.com")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res["Access-Control-Allow-Origin"], "https://app.example.com")
        allowed = [h.strip().lower() for h in res["Access-Control-Allow-Headers"].split(",")]
        self.assertIn("authorization", allowed)
        self.assertNotIn("x-device-key", allowed)

    def test_preflight_from_unknown_origin_gets_no_cors_headers(self):
        res = self.preflight("https://evil.example.com")
        self.assertNotIn("Access-Control-Allow-Origin", res)
