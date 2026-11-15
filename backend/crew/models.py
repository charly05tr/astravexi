from django.db import models

from devices.models import Device


class CrewProfile(models.Model):
    class Role(models.TextChoices):
        ASTRONAUT = "astronaut"
        CMO = "cmo"
        FLIGHT_SURGEON = "flightSurgeon"

    id = models.CharField(max_length=64, primary_key=True)  # client-generated
    # Owner. Only this device may write or read the profile and its records.
    device = models.ForeignKey(Device, on_delete=models.PROTECT, related_name="profiles")
    name = models.CharField(max_length=120)
    role = models.CharField(max_length=20, choices=Role.choices)
    created_at = models.DateTimeField()  # client timestamps
    updated_at = models.DateTimeField()
    server_updated_at = models.DateTimeField(auto_now=True, db_index=True)
    deleted = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.name} ({self.role})"
