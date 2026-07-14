#!/bin/bash
# scripts/prod.sh
# Start/stop production environment
# Usage: ./scripts/prod.sh [command]
#   up:      Start production services
#   stop:    Stop production services
#   logs:    Follow production logs
#   migrate: Run production migrations
#   status:  Show service status

set -euo pipefail

COMPOSE_FILE="podman-compose.prod.yml"

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[PROD]${NC} $*"; }
err()  { echo -e "${RED}[PROD]${NC} $*" >&2; }

# Check for required secrets
check_secrets() {
  if [ ! -f "./secrets/db_password.txt" ]; then
    err "Missing secrets/db_password.txt"
    err "Create it with: echo 'your-password' > secrets/db_password.txt"
    exit 1
  fi

  if [ -z "${JWT_SECRET:-}" ] || [ -z "${JWT_REFRESH_SECRET:-}" ]; then
    err "JWT_SECRET and JWT_REFRESH_SECRET must be set in environment or .env file"
    err "Example: export JWT_SECRET='your-32-char-minimum-secret-here'"
    exit 1
  fi
}

case "${1:-up}" in
  up|start)
    check_secrets
    log "Building and starting production services..."
    podman compose -f "$COMPOSE_FILE" up -d --build
    log "Production services started."
    log "API: http://localhost:${API_PORT:-3001}"
    ;;

  stop)
    log "Stopping production services..."
    podman compose -f "$COMPOSE_FILE" stop
    ;;

  down)
    log "Stopping and removing production containers..."
    podman compose -f "$COMPOSE_FILE" down
    ;;

  logs)
    podman compose -f "$COMPOSE_FILE" logs -f "${2:-api}"
    ;;

  migrate)
    log "Running production migrations..."
    podman compose -f "$COMPOSE_FILE" exec api npx prisma migrate deploy
    log "Migrations applied."
    ;;

  ps|status)
    podman compose -f "$COMPOSE_FILE" ps
    ;;

  restart)
    log "Restarting production services..."
    podman compose -f "$COMPOSE_FILE" restart "${2:-api}"
    ;;

  *)
    echo "Usage: $0 {up|stop|down|logs|migrate|restart|ps}"
    echo ""
    echo "Commands:"
    echo "  up       Build and start production (default)"
    echo "  stop     Stop services (preserves state)"
    echo "  down     Stop and remove containers"
    echo "  logs     Follow logs (optionally: logs api, logs db)"
    echo "  migrate  Run Prisma migrate deploy"
    echo "  restart  Restart a service (optionally: restart api)"
    echo "  ps       Show running services"
    exit 1
    ;;
esac
