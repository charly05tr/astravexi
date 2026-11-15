from django.contrib import admin

from .models import SyncRecord


@admin.register(SyncRecord)
class SyncRecordAdmin(admin.ModelAdmin):
    list_display = ("client_id", "kind", "profile", "deleted", "client_updated_at", "server_updated_at")
    list_filter = ("kind", "deleted")
    search_fields = ("client_id", "profile__id")
