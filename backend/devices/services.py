import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import Device, EnrollmentCode


class InvalidEnrollmentCode(Exception):
    """Unknown, already used or expired code. Deliberately one error so callers cannot tell which."""


def hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def build_enrollment_code(label: str = "", hours: int | None = None) -> tuple[str, EnrollmentCode]:
    """Returns (plaintext_code, unsaved row). The plaintext is never stored; only its hash is."""
    hours = settings.ENROLLMENT_CODE_DEFAULT_HOURS if hours is None else hours
    code = secrets.token_urlsafe(24)  # 192 bits
    row = EnrollmentCode(
        code_hash=hash_secret(code),
        label=label,
        expires_at=timezone.now() + timedelta(hours=hours),
    )
    return code, row


def create_enrollment_code(label: str = "", hours: int | None = None) -> tuple[str, EnrollmentCode]:
    code, row = build_enrollment_code(label, hours)
    row.save()
    return code, row


def enroll_device(code: str, name: str) -> tuple[Device, str]:
    """Consumes `code` and creates a device. Returns (device, plaintext_token); the token is never stored."""
    with transaction.atomic():
        row = EnrollmentCode.objects.select_for_update().filter(code_hash=hash_secret(code)).first()
        if row is None or row.used_at is not None or row.expires_at <= timezone.now():
            raise InvalidEnrollmentCode
        token = secrets.token_urlsafe(32)  # 256 bits
        device = Device.objects.create(name=name, token_hash=hash_secret(token))
        row.used_at = timezone.now()
        row.device = device
        row.save(update_fields=["used_at", "device"])
    return device, token
