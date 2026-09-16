#!/bin/bash
# scripts/restore.sh
# Restore a PostgreSQL backup (custom format) into the running DB container.
# Symmetric to scripts/backup.sh (self-hosted podman path). For the cloud path
# (Neon) use the provider's PITR / branch restore instead — see docs/OPERATIONS.md.
#
# Usage:
#   ./scripts/restore.sh [BACKUP_FILE] [container_name]
#   ./scripts/restore.sh --list <backup>          # just list contents, no restore
#   ./scripts/restore.sh --dry-run <backup>       # verify without restoring
#
# WARNING: restore overwrites current data. For custom-format backups we drop the
# public schema first so the restore is a clean overwrite of the whole DB.

set -euo pipefail

# ─── Configuration ─────────────────────────────
BACKUP_FILE="${1:-}"
CONTAINER_NAME="${2:-pv-db-prod}"
DB_USER="${POSTGRES_USER:-pv_user}"
DB_NAME="punto_venta"

# Password: prefer the prod secret (podman mounted in /run/secrets/db_password),
# else fall back to POSTGRES_PASSWORD env (dev/adhoc). Empty is allowed when the
# role trust-auths via the unix socket inside the container.
DB_PASSWORD=""
if [ -r /run/secrets/db_password ]; then
  DB_PASSWORD="$(cat /run/secrets/db_password)"
fi

# ─── Colors / log helpers ──────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
log_info() { echo -e "${GREEN}[INFO]${NC}  $(date '+%Y-%m-%d %H:%M:%S') $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC}  $(date '+%Y-%m-%d %H:%M:%S') $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') $*" >&2; }

# ─── Usage / pre-flight ────────────────────────
usage() {
  cat <<EOF
Usage: $0 [--list|--dry-run] BACKUP_FILE [container_name]

  BACKUP_FILE   path to a custom-format .sql.gz produced by scripts/backup.sh
  container_name  podman container running Postgres (default: pv-db-prod)

Modes:
  (default)     restore BACKUP_FILE overwriting current data
  --list        print the backup's TOC (table of contents) without touching the DB
  --dry-run     validate the backup and dependencies; do not execute restore

Examples:
  $0 --list /backups/punto-venta/backup_20260714_020000.sql.gz
  $0 /backups/punto-venta/backup_20260714_020000.sql.gz
EOF
  exit 1
}

MODE="restore"
case "${1:-}" in
--list)
  MODE="list"
  BACKUP_FILE="${2:-}"
  CONTAINER_NAME="${3:-pv-db-prod}"
  ;;
--dry-run)
  MODE="dry-run"
  BACKUP_FILE="${2:-}"
  CONTAINER_NAME="${3:-pv-db-prod}"
  ;;
-h | --help) usage ;;
esac

if [ -z "$BACKUP_FILE" ]; then
  log_error "No backup file provided."
  usage
fi

if [ ! -f "$BACKUP_FILE" ]; then
  log_error "Backup file not found: $BACKUP_FILE"
  exit 1
fi

# Requires gzip (local) + pg_restore (local or in-container) + podman + the running container.
if ! command -v podman &>/dev/null; then
  log_error "podman not found. Install podman first."
  exit 1
fi
if ! podman ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  log_error "Container '${CONTAINER_NAME}' is not running."
  podman ps --format '  {{.Names}} ({{.Status}})'
  exit 1
fi

# ─── Modes that do not mutate the DB ───────────
if [ "$MODE" = "list" ]; then
  log_info "Listing TOC of ${BACKUP_FILE} (no DB changes)..."
  gunzip -c "$BACKUP_FILE" |
    podman exec -i "$CONTAINER_NAME" pg_restore --list -U "$DB_USER" -d "$DB_NAME" /dev/stdin
  log_info "Done."
  exit 0
fi

if [ "$MODE" = "dry-run" ]; then
  log_info "Validating ${BACKUP_FILE} (no DB changes)..."
  if gzip -t "$BACKUP_FILE" 2>/dev/null; then
    log_info "gzip integrity: OK"
  else
    log_error "gzip integrity: FAILED — corrupted backup."
    exit 1
  fi
  if gunzip -c "$BACKUP_FILE" |
    podman exec -i "$CONTAINER_NAME" pg_restore --list >/dev/null 2>&1; then
    log_info "pg_restore TOC: OK"
  else
    log_warn "pg_restore TOC: FAILED (the backup may still be partially valid)"
  fi
  log_info "Dry-run complete. Nothing was restored."
  exit 0
fi

# ─── Restore (mutating) ────────────────────────
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
log_warn "Restore will OVERWRITE all data in '${DB_NAME}' (container '${CONTAINER_NAME}')."
echo -n "Type 'yes' to continue: "
read -r CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  log_info "Aborted by user."
  exit 1
fi

log_info "Dropping existing public schema in '${DB_NAME}'..."
RESTORE_PGW=$(
  cat <<'SQL'
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'public') THEN
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO PUBLIC;
  END IF;
END $$;
SQL
)
if ! podman exec -e PGPASSWORD="$DB_PASSWORD" "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c "$RESTORE_PGW"; then
  log_error "Failed to drop/recreate public schema. Aborting before restore."
  exit 1
fi

log_info "Restoring ${BACKUP_FILE} (${BACKUP_SIZE}) into '${DB_NAME}'..."
if gunzip -c "$BACKUP_FILE" |
  podman exec -e PGPASSWORD="$DB_PASSWORD" -i "$CONTAINER_NAME" \
    pg_restore --verbose --no-owner --role="$DB_USER" -U "$DB_USER" -d "$DB_NAME" /dev/stdin \
    2>/dev/null; then
  log_info "Restore completed: ${BACKUP_FILE}"
else
  log_error "Restore reported errors. Backups may still be partially restored."
  exit 1
fi

log_info "Done."
