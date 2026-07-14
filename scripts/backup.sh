#!/bin/bash
# scripts/backup.sh
# Automated PostgreSQL backup with retention policy
# Usage: ./scripts/backup.sh [container_name] [backup_dir]

set -euo pipefail

# ─── Configuration ─────────────────────────────
CONTAINER_NAME="${1:-pv-db-prod}"
BACKUP_DIR="${2:-/backups/punto-venta}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_USER="${POSTGRES_USER:-pv_user}"
DB_NAME="punto_venta"

# ─── Colors ────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info()  { echo -e "${GREEN}[INFO]${NC}  $(date '+%Y-%m-%d %H:%M:%S') $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $(date '+%Y-%m-%d %H:%M:%S') $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') $*" >&2; }

# ─── Pre-flight checks ────────────────────────
if ! command -v podman &> /dev/null; then
  log_error "podman not found. Install podman first."
  exit 1
fi

if ! podman ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  log_error "Container '${CONTAINER_NAME}' is not running."
  log_info "Running containers:"
  podman ps --format '  {{.Names}} ({{.Status}})'
  exit 1
fi

# ─── Create backup directory ───────────────────
mkdir -p "$BACKUP_DIR"

# ─── Perform backup ────────────────────────────
BACKUP_FILE="${BACKUP_DIR}/backup_${TIMESTAMP}.sql.gz"

log_info "Starting backup of '${DB_NAME}' from container '${CONTAINER_NAME}'..."

if podman exec "$CONTAINER_NAME" \
  pg_dump -U "$DB_USER" -d "$DB_NAME" \
  --format=custom \
  --compress=9 \
  --verbose 2>/dev/null \
  | gzip > "$BACKUP_FILE"; then

  BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  log_info "Backup completed: ${BACKUP_FILE} (${BACKUP_SIZE})"
else
  log_error "Backup FAILED!"
  rm -f "$BACKUP_FILE"
  exit 1
fi

# ─── Verify backup integrity ──────────────────
if gzip -t "$BACKUP_FILE" 2>/dev/null; then
  log_info "Backup integrity verified."
else
  log_error "Backup file is corrupted!"
  exit 1
fi

# ─── Cleanup old backups ───────────────────────
DELETED_COUNT=$(find "$BACKUP_DIR" -name "backup_*.sql.gz" -mtime +"$RETENTION_DAYS" -type f -print -delete | wc -l)

if [ "$DELETED_COUNT" -gt 0 ]; then
  log_info "Cleaned up ${DELETED_COUNT} backup(s) older than ${RETENTION_DAYS} days."
fi

# ─── Summary ───────────────────────────────────
TOTAL_BACKUPS=$(find "$BACKUP_DIR" -name "backup_*.sql.gz" -type f | wc -l)
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)

log_info "=== Backup Summary ==="
log_info "  File:       ${BACKUP_FILE}"
log_info "  Size:       ${BACKUP_SIZE}"
log_info "  Total:      ${TOTAL_BACKUPS} backup(s) (${TOTAL_SIZE})"
log_info "  Retention:  ${RETENTION_DAYS} days"
log_info "  Next:       $(date -d '+1 day' '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo 'N/A')"

# ─── Verify backup with pg_restore (dry run) ───
if command -v pg_restore &> /dev/null; then
  if pg_restore --list "$BACKUP_FILE" &> /dev/null; then
    log_info "pg_restore verification: OK"
  else
    log_warn "pg_restore verification: FAILED (backup may still be valid)"
  fi
fi

log_info "Done."
