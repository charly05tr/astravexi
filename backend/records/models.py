from django.db import models

from crew.models import CrewProfile


class SyncRecord(models.Model):
    class Kind(models.TextChoices):
        MANUAL_READING = "manualReading"
        DECISION = "decision"
        ACK = "ack"
        OUTBOX = "outbox"
        META = "meta"
        ROUTINE = "routine"  # reserved for slice 3
        ROUTINE_PROGRESS = "routineProgress"  # reserved for slice 3

    profile = models.ForeignKey(CrewProfile, on_delete=models.CASCADE, related_name="records")
    kind = models.CharField(max_length=20, choices=Kind.choices)
    client_id = models.CharField(max_length=128)
    payload = models.JSONField(default=dict)
    client_updated_at = models.DateTimeField()
    server_updated_at = models.DateTimeField(auto_now=True, db_index=True)
    deleted = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["profile", "kind", "client_id"], name="uniq_profile_kind_client_id"
            )
        ]

    def __str__(self):
        return f"{self.kind}:{self.client_id}"
