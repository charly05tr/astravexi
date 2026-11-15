from django.contrib import admin

from .models import CrewProfile


@admin.register(CrewProfile)
class CrewProfileAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "role", "deleted", "updated_at", "server_updated_at")
    list_filter = ("role", "deleted")
    search_fields = ("id", "name")
