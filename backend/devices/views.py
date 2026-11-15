from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .services import InvalidEnrollmentCode, enroll_device


class EnrollSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=256, trim_whitespace=True)
    name = serializers.CharField(max_length=120, trim_whitespace=True)


class EnrollView(APIView):
    authentication_classes: list = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "enroll"

    def post(self, request):
        data = EnrollSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        try:
            device, token = enroll_device(data.validated_data["code"], data.validated_data["name"])
        except InvalidEnrollmentCode:
            return Response({"detail": "Invalid or expired enrollment code."}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"device_id": str(device.id), "token": token}, status=status.HTTP_201_CREATED)
