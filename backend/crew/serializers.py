from rest_framework import serializers

from .models import CrewProfile


class CrewProfileSerializer(serializers.ModelSerializer):
    # The id is client-generated, so it is writable (and not auto-validated as unique: it is upserted).
    id = serializers.CharField(max_length=64)

    class Meta:
        model = CrewProfile
        fields = ["id", "name", "role", "created_at", "updated_at", "server_updated_at", "deleted"]
        read_only_fields = ["server_updated_at"]
