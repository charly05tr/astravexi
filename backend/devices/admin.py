from django import forms
from django.contrib import admin, messages

from .models import Device, EnrollmentCode
from .services import build_enrollment_code


@admin.register(Device)
class DeviceAdmin(admin.ModelAdmin):
    list_display = ("name", "id", "created_at", "last_seen_at", "revoked")
    list_filter = ("revoked",)
    search_fields = ("name", "id")
    readonly_fields = ("id", "token_hash", "created_at", "last_seen_at")
    actions = ["revoke_devices", "restore_devices"]

    def has_add_permission(self, request):
        return False  # devices are created only by enrolling with a code

    @admin.action(description="Revoke selected devices")
    def revoke_devices(self, request, queryset):
        self.message_user(request, f"Revoked {queryset.update(revoked=True)} device(s).", messages.SUCCESS)

    @admin.action(description="Restore selected devices")
    def restore_devices(self, request, queryset):
        self.message_user(request, f"Restored {queryset.update(revoked=False)} device(s).", messages.SUCCESS)


class EnrollmentCodeForm(forms.ModelForm):
    hours = forms.IntegerField(required=False, min_value=1, max_value=24 * 30, initial=24, help_text="Validity in hours.")

    class Meta:
        model = EnrollmentCode
        fields = ["label"]


@admin.register(EnrollmentCode)
class EnrollmentCodeAdmin(admin.ModelAdmin):
    """Adding a row generates a code and shows it once; only its hash is stored."""

    form = EnrollmentCodeForm
    list_display = ("label", "created_at", "expires_at", "used_at", "device")
    list_filter = ("used_at",)

    def get_fields(self, request, obj=None):
        if obj is None:
            return ["label", "hours"]
        return ["label", "created_at", "expires_at", "used_at", "device"]

    def get_readonly_fields(self, request, obj=None):
        return ["label", "created_at", "expires_at", "used_at", "device"] if obj else []

    def save_model(self, request, obj, form, change):
        if change:
            return
        code, built = build_enrollment_code(label=obj.label, hours=form.cleaned_data.get("hours") or None)
        obj.code_hash, obj.expires_at = built.code_hash, built.expires_at
        obj.save()
        self.message_user(request, f"Enrollment code (shown once, copy it now): {code}", messages.WARNING)
