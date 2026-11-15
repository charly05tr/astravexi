# Astravexi backend

Minimal Django + DRF API. The device (IndexedDB) stays the source of truth; this server stores synced
copies. PostgreSQL 17. There are no user accounts: every browser/app install is an enrolled **device** with its
own revocable token, and a device can only see the profiles (and records) it created.

**HTTPS only.** Device tokens travel in the `Authorization` header; never expose this API over plain HTTP. The
production stack terminates TLS in nginx and Django redirects/flags everything as secure when `DEBUG=False`.
The frontend also needs a secure context (HTTPS or `localhost`) for `crypto.randomUUID` and `crypto.subtle`.

## Dev

```sh
cd backend
python -m venv .venv && .venv/Scripts/activate   # or: source .venv/bin/activate
pip install -r requirements.txt
# create .env from the template below, with a reachable Postgres (e.g. `docker compose up -d db`)
python manage.py migrate
python manage.py createsuperuser                  # for /admin/
python manage.py runserver                        # http://localhost:8000
```

The frontend is a separate app and talks to this API cross-origin (CORS), exactly as in production. Docker
setup: `cd backend && docker compose up --build` (starts Postgres too). Then, at the repo root, run the frontend
pointing at it:

```sh
VITE_API_URL=http://localhost:8000 pnpm dev      # http://localhost:5173 (must be in CORS_ALLOWED_ORIGINS)
```

On PowerShell: `$env:VITE_API_URL="http://localhost:8000"; pnpm dev`. There is no dev proxy. Do not commit
`.env*` files.

The image runs as a non-root user (`app`, uid 1000). With the dev bind mount (`.:/app`) on Linux, make sure
`backend/staticfiles` is writable by uid 1000 (or create it yourself first).

## Tests

```sh
docker compose run --rm web python manage.py test
# or, with a Postgres reachable through the environment: python manage.py test
```

Tests need PostgreSQL (there is no sqlite fallback).

## Environment (`backend/.env`)

```
DEBUG=True
SECRET_KEY=...                           # required when DEBUG is false: >= 50 chars, must not contain "change-me"
ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:5173
CSRF_TRUSTED_ORIGINS=http://localhost:5173
DB_NAME=astravexi
DB_USER=astravexi
DB_PASSWORD=...                          # when DEBUG is false: >= 12 chars, not a placeholder ("change...", "password", ...)
POSTGRES_HOST=db                         # compose service name (localhost outside docker)
POSTGRES_PORT=5432
DOMAIN=example.com                       # prod only

# Optional
SECURE_HSTS_SECONDS=31536000             # prod only
SECURE_HSTS_INCLUDE_SUBDOMAINS=False     # prod only
SECURE_SSL_REDIRECT=True                 # prod only
NUM_PROXIES=1                            # reverse proxies in front of gunicorn (client IP for throttling); 0 in DEBUG
ENROLL_THROTTLE_RATE=10/hour             # per client IP, on POST /api/devices/enroll/
SYNC_MAX_FUTURE_SKEW_SECONDS=300         # items stamped later than now + this are rejected_future
SYNC_PULL_OVERLAP_SECONDS=120            # see "Pull"
```

With `DEBUG=False` the process refuses to start if `SECRET_KEY` or `DB_PASSWORD` look like placeholders. It also
enables secure cookies, HSTS, `SECURE_SSL_REDIRECT`, nosniff and trusts `X-Forwarded-Proto` from nginx (so the
backend must only be reachable through nginx).

Frontend (build-time, not in `backend/.env`): `VITE_API_URL` = base URL of this API without a trailing slash
(`http://localhost:8000` in dev, `https://$DOMAIN` in prod).

`CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS` are comma-separated origins (scheme + host + port, no path) and must
include the frontend origin. `Authorization` and `Content-Type` are allowed in CORS preflights.

The enroll throttle uses Django's local-memory cache, so it is per gunicorn worker; nginx `limit_req` is the
effective global limit.

## Device enrollment

1. An admin creates a single-use code (valid 24h by default, random, stored only as a sha256 hash, shown once):
   - Django admin: `/admin/` -> Enrollment codes -> Add (label, validity in hours). The plaintext appears once in the
     success message.
   - or CLI: `python manage.py create_enrollment_code --label "Dr. Ada" --hours 24` (prints the code once).
2. The CMO pastes the code into the app once. The app calls `POST /api/devices/enroll/` and stores the returned
   device token locally. The token is shown only once and only its hash is stored server-side.
3. Every later request sends `Authorization: Device <token>`.
4. Revoke a lost device in the admin (Devices -> select -> "Revoke selected devices"); its next request gets 401.

Existing pre-release data: migration `crew.0002` deletes profiles/records that predate device ownership
(`CrewProfile.device` is now required). Devices re-push their local data after enrolling.

## Production deploy

Backend only. Stack (`backend/docker-compose.prod.yml`): `web` (gunicorn + whitenoise), `db` (Postgres 17, volume
`postgres_data`), `nginx` (built from `nginx/Dockerfile`: `nginx:stable` plus openssl and the bootstrap-cert script, TLS, proxies everything to `web:8000`: `/api/`, `/admin/`, `/static/`),
`certbot` (webroot, renews every 12h). Run every command from `backend/`.

nginx adds HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, caps bodies at 10m and rate
limits `/admin/` (30 req/min per IP) and `/api/devices/enroll/` (10 req/min per IP).

The frontend is deployed separately as static files (any static host/CDN). Build it with `VITE_API_URL` set to
this API's public URL (e.g. `VITE_API_URL=https://api.example.com pnpm build`) and add the frontend's origin to
`CORS_ALLOWED_ORIGINS` (and `CSRF_TRUSTED_ORIGINS` if it needs cookie auth) here.

1. Point the DNS A record of `DOMAIN` at the server; open ports 80 and 443.
2. Fill `backend/.env` with `DEBUG=False`, a real `SECRET_KEY`, `ALLOWED_HOSTS=$DOMAIN`,
   `CORS_ALLOWED_ORIGINS=<frontend origin>`, `CSRF_TRUSTED_ORIGINS=<frontend origin>`, `DOMAIN`, and the DB vars.
3. Start everything. On first run nginx has no certificate, so its entrypoint script
   (`nginx/10-bootstrap-cert.sh`, must be executable) creates a temporary self-signed one; that is what lets the
   HTTPS block load:
   ```sh
   docker compose -f docker-compose.prod.yml up -d --build
   ```
4. Replace the temporary cert with a real one (the self-signed files must be removed first, or certbot
   will treat the lineage as existing):
   ```sh
   D="docker compose -f docker-compose.prod.yml"
   $D run --rm --entrypoint sh certbot -c "rm -rf /etc/letsencrypt/live/$DOMAIN /etc/letsencrypt/archive/$DOMAIN /etc/letsencrypt/renewal/$DOMAIN.conf"
   $D run --rm --entrypoint certbot certbot certonly --webroot -w /var/www/certbot -d $DOMAIN --email you@example.com --agree-tos --no-eff-email
   $D exec nginx nginx -s reload
   ```
   Use `--staging` first to avoid rate limits. Renewals are automatic; nginx reloads every 6h to pick them up.
5. Create the admin user: `$D exec web python manage.py createsuperuser`, then an enrollment code
   (`$D exec web python manage.py create_enrollment_code --label ...`).

## API contract

All `/api/` endpoints except `/api/health/` and `/api/devices/enroll/` need `Authorization: Device <token>`.
A missing, unknown or revoked token gets `401` (`WWW-Authenticate: Device`).
Timestamps are ISO 8601. Ids are client-generated strings. Deletes are tombstones (`deleted: true`).
`kind` is one of `manualReading`, `decision`, `ack`, `outbox`, `meta`, `routine`, `routineProgress`.
`role` is one of `astronaut`, `cmo`, `flightSurgeon`. No PIN or secret is ever sent.

`GET /api/health/` -> `{"status": "ok"}` (public)

`POST /api/devices/enroll/` (public, throttled 10/hour per IP) body `{"code": "...", "name": "CMO laptop"}`
-> `201 {"device_id": "<uuid>", "token": "<url-safe, 256-bit>"}`. Invalid, used or expired code: `400
{"detail": "Invalid or expired enrollment code."}` (one message for all three). Over the throttle: `429`.

### Ownership

Every profile belongs to the device that created it. A device can only create, update, push, pull and list its own
profiles and the records of those profiles. A record for a profile the device does not own, and a profile id that
already belongs to another device, both get the item status `forbidden`; an unknown profile is indistinguishable
from someone else's, so existence is not leaked.

### Push

`POST /api/sync/push/` (single transaction). A malformed item rejects the whole batch with `400`; otherwise every
item gets a status:

| status            | meaning                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------- |
| `applied`         | written                                                                                   |
| `stale`           | not strictly newer (by client `updated_at` / `client_updated_at`) than the stored row     |
| `forbidden`       | profile owned by another device, or unknown profile (records)                             |
| `rejected_future` | client timestamp later than server now + `SYNC_MAX_FUTURE_SKEW_SECONDS` (default 5 min)   |

```json
{
  "profiles": [{"id": "p1", "name": "Ada", "role": "astronaut", "created_at": "...", "updated_at": "...", "deleted": false}],
  "records": [{"profile": "p1", "kind": "manualReading", "client_id": "r1", "payload": {}, "client_updated_at": "...", "deleted": false}]
}
```
Response:
```json
{"profiles": [{"id": "p1", "status": "applied"}],
 "records": [{"profile": "p1", "kind": "manualReading", "client_id": "r1", "status": "stale"}]}
```
Conflict rule: last write wins by client timestamp. Records are unique per `(profile, kind, client_id)`. Profiles in
the same request are applied first. A lost first-insert race is retried once as an update (no 500).

### Pull

`GET /api/sync/pull/?since=<timestamp>&cursor=<opaque>&profile=<id>&limit=<n>` (all optional)

```json
{"profiles": [...], "records": [{"...": "...", "server_updated_at": "..."}],
 "has_more": true, "next_cursor": "<opaque>", "next_since": "2026-01-01T11:00:00.123456Z"}
```

- Rows are ordered by `(server_updated_at, pk)`, tombstones included, scoped to the calling device.
- `limit` applies per collection (profiles and records each), default 500, max 1000 (larger values are clamped).
- **Starting a sync**: no params returns everything; `since=<next_since stored from the last finished pull>` returns
  rows with `server_updated_at >= since - SYNC_PULL_OVERLAP_SECONDS` (default 120s). The overlap exists because
  `server_updated_at` is stamped when a row is saved, not when its transaction commits, so a slow commit can land
  "in the past" of a cursor already handed out. Rows may therefore be delivered again; clients must upsert by id.
  `since` must carry a timezone offset.
- **Paging**: while `has_more` is true, call again with `cursor=<next_cursor>` (plus the same `limit`/`profile`).
  The cursor encodes the keyset position `(server_updated_at, pk)` of the last row of each collection, so paging
  never repeats rows and the overlap is applied only once, on the first request. `since` is ignored when a cursor is
  present. `next_cursor` is `null` when `has_more` is false. A malformed cursor gives `400`.
- **Finishing**: when `has_more` is false, store `next_since` (the newest `server_updated_at` seen across the whole
  pull, or the given `since` if nothing newer; `null` if the server has nothing) and send it as `since` next time.

### Profiles

`GET /api/profiles/` lists the device's profiles. `POST /api/profiles/` upserts one profile:
`200 {"status": "applied"|"stale", "profile": {...}}`, `403 {"status": "forbidden"}`,
`400 {"status": "rejected_future"}`.

## Frontend sync

The app syncs only in LIVE mode and only when it was built with `VITE_API_URL` (unset: the feature is hidden and the
app is fully offline). A CMO enrolls the device from the user menu -> "Mission control sync" with a single-use code
and a device name; the token is kept in the device-wide IndexedDB `astravexi-live-device` (never per profile, never
in DEMO) and sent only in `Authorization: Device <token>`. Disconnect forgets it; a `401` means the device was
revoked, which clears it and asks for a new code.

A sync is **push, then pull**, run on start, ~5 s after a local write, every 60 s and on the `online` event, never
two at once, with exponential backoff (jittered, capped at ~5 min) after a failure.

- **Push**: the device's profiles, then, per profile, every row of its LIVE database (readings, decisions, acks,
  outbox, meta keyed by key) whose `updatedAt` is at or after that profile's watermark (the newest `updatedAt` of the
  last fully accepted batch; the boundary row is re-sent, the server answers `stale`). Batches of at most 200. A
  watermark does not move while the server answers `rejected_future` (device clock ahead: the rows are retried and the
  UI says so); `forbidden` items are recorded in the sync state and not retried; `stale` needs nothing.
- **Pull**: pages with `cursor` while `has_more`, upserts by id last-write-wins on `updatedAt` (a newer local row is
  never overwritten; redelivery from the 120 s overlap is harmless), creates profiles missing locally (without a PIN:
  the server never has one; a local PIN is kept), and stores `next_since` only after the last page.
- Tombstones and `routine`/`routineProgress` records are not applied on the device yet.

Opt-in end-to-end smoke against a running backend (two fresh codes from `create_enrollment_code`; see the header of
the file): `E2E_API_URL=http://127.0.0.1:8000 E2E_CODE_A=... E2E_CODE_B=... npx vitest run --config scripts/vitest.e2e.config.ts`.
