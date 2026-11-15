from pathlib import Path

from decouple import Csv, config
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent

DEBUG = config("DEBUG", default=False, cast=bool)
# No default outside DEBUG: a missing SECRET_KEY must fail loudly in production.
SECRET_KEY = config("SECRET_KEY", default="dev-insecure-key" if DEBUG else None)
ALLOWED_HOSTS = config("ALLOWED_HOSTS", default="localhost,127.0.0.1", cast=Csv())

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "devices",
    "crew",
    "records",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": config("DB_NAME"),
        "USER": config("DB_USER"),
        "PASSWORD": config("DB_PASSWORD"),
        "HOST": config("POSTGRES_HOST"),
        "PORT": config("POSTGRES_PORT", default="5432"),
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

CORS_ALLOWED_ORIGINS = config("CORS_ALLOWED_ORIGINS", default="", cast=Csv())
CSRF_TRUSTED_ORIGINS = config("CSRF_TRUSTED_ORIGINS", default="", cast=Csv())
CORS_ALLOW_HEADERS = ["accept", "authorization", "content-type"]

# Request bodies up to 10 MiB (nginx enforces the same limit with client_max_body_size).
DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024

# --- Sync tuning ---
# Reject items whose client timestamp is further in the future than this (stops LWW poisoning).
SYNC_MAX_FUTURE_SKEW_SECONDS = config("SYNC_MAX_FUTURE_SKEW_SECONDS", default=300, cast=int)
# A new pull starting from a stored `since` re-includes rows this many seconds older than it, so rows whose
# transaction committed late (server_updated_at is stamped at save, not at commit) are not skipped.
SYNC_PULL_OVERLAP_SECONDS = config("SYNC_PULL_OVERLAP_SECONDS", default=120, cast=int)
SYNC_PULL_DEFAULT_LIMIT = 500
SYNC_PULL_MAX_LIMIT = 1000

# --- Devices ---
ENROLLMENT_CODE_DEFAULT_HOURS = 24
# Minimum seconds between `last_seen_at` writes for one device.
DEVICE_LAST_SEEN_INTERVAL_SECONDS = 300

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["devices.authentication.DeviceAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["devices.permissions.IsEnrolledDevice"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "UNAUTHENTICATED_USER": None,
    "DEFAULT_THROTTLE_RATES": {"enroll": config("ENROLL_THROTTLE_RATE", default="10/hour")},
    # Number of reverse proxies (nginx) in front of gunicorn; used to resolve the client IP for throttling.
    "NUM_PROXIES": config("NUM_PROXIES", default=0 if DEBUG else 1, cast=int),
}

# --- Production hardening (everything below applies only when DEBUG is false) ---
if not DEBUG:
    _PLACEHOLDER_DB_PASSWORDS = {"password", "postgres", "admin", "secret", "astravexi", "root"}

    if not SECRET_KEY or len(SECRET_KEY) < 50 or "change-me" in SECRET_KEY.lower():
        raise ImproperlyConfigured(
            "SECRET_KEY must be set, at least 50 characters long and must not contain 'change-me' when DEBUG is false."
        )
    _db_password = DATABASES["default"]["PASSWORD"]
    if (
        len(_db_password) < 12
        or "change" in _db_password.lower()
        or _db_password.lower() in _PLACEHOLDER_DB_PASSWORDS
    ):
        raise ImproperlyConfigured("DB_PASSWORD looks like a placeholder; set a strong password when DEBUG is false.")

    # Behind nginx terminating TLS (nginx sets X-Forwarded-Proto). The backend must only be reachable via nginx.
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = config("SECURE_SSL_REDIRECT", default=True, cast=bool)
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = config("SECURE_HSTS_SECONDS", default=31536000, cast=int)
    SECURE_HSTS_INCLUDE_SUBDOMAINS = config("SECURE_HSTS_INCLUDE_SUBDOMAINS", default=False, cast=bool)
    SECURE_CONTENT_TYPE_NOSNIFF = True
