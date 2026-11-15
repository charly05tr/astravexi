from rest_framework.permissions import BasePermission

from .models import Device


class IsEnrolledDevice(BasePermission):
    message = "Authentication with an enrolled device token is required."

    def has_permission(self, request, view):
        return isinstance(request.user, Device)
