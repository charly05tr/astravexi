import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    # Separate from 0002 so the data deletion is committed before the schema change (PostgreSQL refuses to
    # ALTER a table with pending trigger events in the same transaction).
    dependencies = [
        ("crew", "0002_drop_unowned_profiles"),
        ("devices", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="crewprofile",
            name="device",
            field=models.ForeignKey(
                default=None,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="profiles",
                to="devices.device",
            ),
            preserve_default=False,
        ),
    ]
