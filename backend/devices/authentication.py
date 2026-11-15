import hmac
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .models import Device
from .services import hash_secret

KEYWORD = "Device"
MAX_TOKEN_LENGTH = 256


class DeviceAuthentication(BaseAuthentication):
    """`Authorization: Device <token>`. The token is hashed and looked up; revoked devices are rejected."""

    def authenticate_header(self, request):
        return KEYWORD

    def authenticate(self, request):
        header = request.headers.get("Authorization", "")
        scheme, _, token = header.partition(" ")
        if scheme.lower() != KEYWORD.lower():
            return None  # no/other credentials: the permission class answers 401
        token = token.strip()
        if not token or len(token) > MAX_TOKEN_LENGTH:
            raise AuthenticationFailed("Invalid device token.")

        digest = hash_secret(token)  # utf-8 encoding: non-ASCII input is just another (unknown) token
        device = Device.objects.filter(token_hash=digest).first()
        # Defence in depth: constant-time comparison on bytes of the digests.
        if device is None or not hmac.compare_digest(device.token_hash.encode(), digest.encode()):
            raise AuthenticationFailed("Invalid device token.")
        if device.revoked:
            raise AuthenticationFailed("This device has been revoked.")

        now = timezone.now()
        interval = timedelta(seconds=settings.DEVICE_LAST_SEEN_INTERVAL_SECONDS)
        if device.last_seen_at is None or now - device.last_seen_at > interval:
            Device.objects.filter(pk=device.pk).update(last_seen_at=now)
            device.last_seen_at = now
        return device, None
