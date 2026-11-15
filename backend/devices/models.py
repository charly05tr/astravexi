import uuid

from django.db import models


class Device(models.Model):
    """An enrolled browser/app install. Authenticates with a bearer token; only its sha256 is stored."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=120)
    token_hash = models.CharField(max_length=64, unique=True, editable=False)  # sha256 hex
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    revoked = models.BooleanField(default=False)

    # Lets DRF treat an enrolled device as an authenticated principal.
    is_authenticated = True

    def __str__(self):
        return f"{self.name} ({self.id})"


class EnrollmentCode(models.Model):
    """Single-use, expiring code an admin hands to a CMO to enroll one device. Only its hash is stored."""

    code_hash = models.CharField(max_length=64, unique=True, editable=False)  # sha256 hex
    label = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    device = models.OneToOneField(
        Device, null=True, blank=True, on_delete=models.SET_NULL, related_name="enrollment_code"
    )

    def __str__(self):
        return self.label or f"code #{self.pk}"
