from datetime import timedelta

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from .models import CrewProfile

APPLIED = "applied"
STALE = "stale"
FORBIDDEN = "forbidden"
REJECTED_FUTURE = "rejected_future"


def is_too_far_in_future(moment) -> bool:
    """True when a client timestamp is later than server now + SYNC_MAX_FUTURE_SKEW_SECONDS (LWW poisoning)."""
    return moment > timezone.now() + timedelta(seconds=settings.SYNC_MAX_FUTURE_SKEW_SECONDS)


def _update_existing(profile: CrewProfile, device, data) -> str:
    if profile.device_id != device.id:
        return FORBIDDEN  # same answer whether the id is unknown to this device's view or owned by another
    if data["updated_at"] <= profile.updated_at:
        return STALE
    for field, value in data.items():
        setattr(profile, field, value)
    profile.save()
    return APPLIED


def upsert_profile(device, data) -> str:
    """Last-write-wins upsert by client `updated_at`, scoped to `device`. Returns an item status.

    Must be called inside a transaction. The first insert runs in a savepoint: if a concurrent request wins
    the race, the IntegrityError is caught and the row is re-read (locked) and updated instead.
    """
    if is_too_far_in_future(data["updated_at"]):
        return REJECTED_FUTURE
    profile = CrewProfile.objects.select_for_update().filter(pk=data["id"]).first()
    if profile is None:
        try:
            with transaction.atomic():
                CrewProfile.objects.create(device=device, **data)
            return APPLIED
        except IntegrityError:
            profile = CrewProfile.objects.select_for_update().get(pk=data["id"])
    return _update_existing(profile, device, data)
