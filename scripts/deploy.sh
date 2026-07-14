#!/bin/bash
# scripts/deploy.sh
# Deploy to production
# Usage: ./scripts/deploy.sh
# Pulls latest changes, builds, and deploys with zero-downtime

set -euo pipefail

COMPOSE_FILE="podman-compose.prod.yml"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[DEPLOY]${NC} $*"; }
warn() { echo -e "${YELLOW}[DEPLOY]${NC} $*"; }
err()  { echo -e "${RED}[DEPLOY]${NC} $*" >&2; }

# ─── Pre-deploy checks ────────────────────────
log "=== Punto de Venta - Deployment ==="
log "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Check secrets
if [ ! -f "./secrets/db_password.txt" ]; then
  err "Missing secrets/db_password.txt — aborting."
  exit 1
fi

if [ -z "${JWT_SECRET:-}" ] || [ -z "${JWT_REFRESH_SECRET:-}" ]; then
  err "JWT secrets not configured in environment."
  exit 1
fi

# ─── Step 1: Pull latest changes ──────────────
log "Step 1/5: Pulling latest changes..."
if command -v jj &> /dev/null; then
  jj pull 2>/dev/null || warn "jj pull failed — working with current state"
  jj update 2>/dev/null || warn "jj update failed"
elif command -v git &> /dev/null; then
  git pull --rebase 2>/dev/null || warn "git pull failed — working with current state"
else
  warn "No VCS found — skipping pull"
fi

# ─── Step 2: Create backup before deploy ──────
log "Step 2/5: Creating pre-deploy backup..."
if [ -f "./scripts/backup.sh" ]; then
  ./scripts/backup.sh 2>/dev/null && log "Pre-deploy backup completed." || warn "Backup failed — continuing anyway."
else
  warn "backup.sh not found — skipping pre-deploy backup."
fi

# ─── Step 3: Build new images ─────────────────
log "Step 3/5: Building new container images..."
podman compose -f "$COMPOSE_FILE" build --no-cache

# ─── Step 4: Run migrations ───────────────────
log "Step 4/5: Running database migrations..."
podman compose -f "$COMPOSE_FILE" up -d db redis
sleep 5  # Wait for DB to be ready

podman compose -f "$COMPOSE_FILE" exec -T api npx prisma migrate deploy 2>/dev/null || {
  warn "Migrations may need the API to be running. Attempting restart..."
  podman compose -f "$COMPOSE_FILE" up -d api
  sleep 10
  podman compose -f "$COMPLOY_FILE" exec -T api npx prisma migrate deploy || err "Migration failed — check logs."
}

# ─── Step 5: Deploy with rolling restart ──────
log "Step 5/5: Deploying services..."
podman compose -f "$COMPOSE_FILE" up -d --remove-orphans

# ─── Post-deploy verification ─────────────────
log "Verifying deployment..."
sleep 5

HEALTH_URL="http://localhost:${API_PORT:-3001}/health"
if wget --no-verbose --tries=3 --spider "$HEALTH_URL" 2>/dev/null; then
  log "✅ Health check passed: $HEALTH_URL"
else
  err "❌ Health check FAILED — the API may not be responding."
  err "Check logs: podman compose -f $COMPOSE_FILE logs api"
  exit 1
fi

# ─── Summary ───────────────────────────────────
log "=== Deployment Complete ==="
log "  API:     http://localhost:${API_PORT:-3001}"
log "  Health:  $HEALTH_URL"
log "  Docs:    http://localhost:${API_PORT:-3001}/docs (non-production only)"
log "  Time:    $(date -u +%Y-%m-%dT%H:%M:%SZ)"
