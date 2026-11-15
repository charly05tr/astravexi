from django.db import transaction
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import CrewProfile
from .serializers import CrewProfileSerializer
from .services import FORBIDDEN, REJECTED_FUTURE, upsert_profile


class ProfileListView(APIView):
    def get(self, request):
        profiles = CrewProfile.objects.filter(device=request.user).order_by("created_at")
        return Response(CrewProfileSerializer(profiles, many=True).data)

    def post(self, request):
        serializer = CrewProfileSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        with transaction.atomic():
            outcome = upsert_profile(request.user, data)
        if outcome == FORBIDDEN:
            return Response({"status": FORBIDDEN}, status=status.HTTP_403_FORBIDDEN)
        if outcome == REJECTED_FUTURE:
            return Response({"status": REJECTED_FUTURE}, status=status.HTTP_400_BAD_REQUEST)
        profile = CrewProfile.objects.get(pk=data["id"], device=request.user)
        return Response({"status": outcome, "profile": CrewProfileSerializer(profile).data})
