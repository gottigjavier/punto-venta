# Database password secret (production, Podman)

`podman-compose.prod.yml` reads the PostgreSQL password from the local secret
file `secrets/db_password.txt` (gitignored). This doc is the setup guide.

## Template

`secrets/db_password.txt` is **not** tracked (the whole `secrets/` dir is
gitignored). The template shipped here is:

```text
# Copy this file to ./secrets/db_password.txt and set a strong password.
# This directory is gitignored — NEVER commit the real password.
#
# Generate:  openssl rand -base64 24  (or:  tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32)
CAMBIAME-por-una-password-fuerte-de-al-menos-24-caracteres
```

## Setup (production)

```bash
mkdir -p secrets
cp docs/secrets-password.md secrets/...   # create from template below
printf '%s\n' "openssl rand -base64 24"   # run:  openssl rand -base64 24 > secrets/db_password.txt
```

## How it's consumed

- `db` service: `POSTGRES_PASSWORD_FILE: /run/secrets/db_password` (Postgres
  initializes the `pv_user` role password on first boot).
- `api` service: a shell entrypoint reads the same file and builds
  `DATABASE_URL="postgresql://pv_user:<pw>@db:5432/punto_venta"` at runtime, so
  the password never appears in `environment`.

## Important

- The volume `pv-postgres-data` is initialized from this secret **only on first
  boot**. Changing the password later desyncs the API until you recreate the
  volume (destructive) or keep both in sync.
- JWT secrets are provided via `JWT_SECRET` / `JWT_REFRESH_SECRET` env vars
  (or the root `.env`), not via this file.
