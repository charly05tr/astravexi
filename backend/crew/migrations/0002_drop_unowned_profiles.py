from django.db import migrations


def drop_unowned(apps, schema_editor):
    """Pre-release: profiles synced before per-device ownership have no owner, so they are discarded.

    Devices re-push their local (source of truth) data after enrolling.
    """
    apps.get_model("records", "SyncRecord").objects.all().delete()
    apps.get_model("crew", "CrewProfile").objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ("crew", "0001_initial"),
        ("records", "0001_initial"),
    ]

    operations = [migrations.RunPython(drop_unowned, migrations.RunPython.noop)]
