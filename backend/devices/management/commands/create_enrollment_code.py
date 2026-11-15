from django.core.management.base import BaseCommand

from devices.services import create_enrollment_code


class Command(BaseCommand):
    help = "Create a single-use device enrollment code and print it once."

    def add_arguments(self, parser):
        parser.add_argument("--label", default="", help="Free-text note, e.g. who the code is for.")
        parser.add_argument("--hours", type=int, default=None, help="Validity in hours (default 24).")

    def handle(self, *args, **options):
        code, row = create_enrollment_code(label=options["label"], hours=options["hours"])
        self.stderr.write(f"Code valid until {row.expires_at.isoformat()}. It is shown only once.")
        self.stdout.write(code)
