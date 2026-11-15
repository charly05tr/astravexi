from rest_framework import serializers

from .models import SyncRecord


class SyncRecordSerializer(serializers.ModelSerializer):
    profile = serializers.CharField(source="profile_id", max_length=64)

    class Meta:
        model = SyncRecord
        fields = ["profile", "kind", "client_id", "payload", "client_updated_at", "server_updated_at", "deleted"]
        read_only_fields = ["server_updated_at"]
        # Uniqueness is handled by the upsert, not rejected by validation.
        validators = []
