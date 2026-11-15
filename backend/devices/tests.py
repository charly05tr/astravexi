import re
from datetime import timedelta
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone

from .models import Device, EnrollmentCode
from .services import create_enrollment_code, hash_secret


def enroll(client, code, name="Tablet"):
    return client.post("/api/devices/enroll/", {"code": code, "name": name}, content_type="application/json")


class EnrollmentTests(TestCase):
    def setUp(self):
        cache.clear()  # the enroll throttle lives in the cache

    def test_valid_code_returns_token_once_and_stores_only_hashes(self):
        code, row = create_enrollment_code(label="Ada")
        self.assertNotIn(code, (row.code_hash, ""))
        self.assertEqual(row.code_hash, hash_secret(code))

        res = enroll(self.client, code)
        self.assertEqual(res.status_code, 201)
        body = res.json()
        device = Device.objects.get()
        self.assertEqual(body["device_id"], str(device.id))
        self.assertGreaterEqual(len(body["token"]), 43)  # 256 bits, URL-safe base64
        self.assertEqual(device.token_hash, hash_secret(body["token"]))
        self.assertNotEqual(device.token_hash, body["token"])
        row.refresh_from_db()
        self.assertIsNotNone(row.used_at)
        self.assertEqual(row.device_id, device.id)

    def test_code_is_single_use(self):
        code, _ = create_enrollment_code()
        self.assertEqual(enroll(self.client, code).status_code, 201)
        self.assertEqual(enroll(self.client, code).status_code, 400)
        self.assertEqual(Device.objects.count(), 1)

    def test_unknown_and_expired_codes_get_the_same_error(self):
        code, row = create_enrollment_code()
        EnrollmentCode.objects.filter(pk=row.pk).update(expires_at=timezone.now() - timedelta(seconds=1))
        expired = enroll(self.client, code)
        unknown = enroll(self.client, "not-a-code")
        self.assertEqual(expired.status_code, 400)
        self.assertEqual(expired.json(), unknown.json())
        self.assertEqual(Device.objects.count(), 0)

    def test_validation_errors(self):
        self.assertEqual(self.client.post("/api/devices/enroll/", {}, content_type="application/json").status_code, 400)
        code, _ = create_enrollment_code()
        self.assertEqual(enroll(self.client, code, name="").status_code, 400)
        self.assertEqual(enroll(self.client, "café-☃").status_code, 400)

    def test_enrolled_token_authenticates(self):
        code, _ = create_enrollment_code()
        token = enroll(self.client, code).json()["token"]
        res = self.client.get("/api/profiles/", HTTP_AUTHORIZATION=f"Device {token}")
        self.assertEqual(res.status_code, 200)

    def test_enroll_endpoint_is_throttled(self):
        statuses = [enroll(self.client, "bad-code").status_code for _ in range(11)]
        self.assertEqual(statuses[:10], [400] * 10)
        self.assertEqual(statuses[10], 429)

    @override_settings(ENROLLMENT_CODE_DEFAULT_HOURS=1)
    def test_default_expiry_and_codes_are_unique_and_long(self):
        codes = {create_enrollment_code()[0] for _ in range(5)}
        self.assertEqual(len(codes), 5)
        self.assertTrue(all(len(c) >= 32 for c in codes))  # >= 192 bits
        row = EnrollmentCode.objects.first()
        self.assertLess(row.expires_at - timezone.now(), timedelta(hours=1, seconds=5))


class ManagementCommandTests(TestCase):
    def test_command_prints_a_usable_code_once(self):
        out, err = StringIO(), StringIO()
        call_command("create_enrollment_code", "--label", "CMO", "--hours", "2", stdout=out, stderr=err)
        code = out.getvalue().strip()
        row = EnrollmentCode.objects.get()
        self.assertEqual(row.label, "CMO")
        self.assertEqual(row.code_hash, hash_secret(code))
        self.assertLess(row.expires_at - timezone.now(), timedelta(hours=2, seconds=5))
        self.assertGreater(row.expires_at - timezone.now(), timedelta(hours=1, minutes=55))


# The manifest storage needs `collectstatic`; admin pages render without it under the plain storage.
@override_settings(
    STORAGES={
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
        "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    }
)
class AdminTests(TestCase):
    def setUp(self):
        cache.clear()
        self.admin = get_user_model().objects.create_superuser("root", "root@example.com", "pw-for-tests-123")
        self.client.force_login(self.admin)

    def test_add_code_in_admin_shows_plaintext_once(self):
        res = self.client.post(
            "/admin/devices/enrollmentcode/add/", {"label": "Grace", "hours": 3}, follow=True
        )
        self.assertEqual(res.status_code, 200)
        text = res.content.decode()
        match = re.search(r"copy it now\): ([A-Za-z0-9_-]+)", text)
        self.assertIsNotNone(match)
        row = EnrollmentCode.objects.get()
        self.assertEqual(row.code_hash, hash_secret(match.group(1)))
        self.assertEqual(row.label, "Grace")
        # Reload: the plaintext is gone.
        again = self.client.get("/admin/devices/enrollmentcode/")
        self.assertNotIn(match.group(1), again.content.decode())
        self.assertEqual(enroll(self.client, match.group(1)).status_code, 201)

    def test_revoke_action(self):
        code, _ = create_enrollment_code()
        token = enroll(self.client, code).json()["token"]
        device = Device.objects.get()
        self.client.post(
            "/admin/devices/device/",
            {"action": "revoke_devices", "_selected_action": [str(device.id)]},
            follow=True,
        )
        device.refresh_from_db()
        self.assertTrue(device.revoked)
        res = self.client.get("/api/profiles/", HTTP_AUTHORIZATION=f"Device {token}")
        self.assertEqual(res.status_code, 401)
