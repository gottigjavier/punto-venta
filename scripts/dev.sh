#!/bin/bash
# scripts/dev.sh
# Start development environment
# Usage: ./scripts/dev.sh [command]
#   No args:  Start all services
#   logs:     Follow API logs
#   migrate:  Run Prisma migrations
#   seed:     Seed the database
#   test:     Run unit tests
#   test:e2e: Run E2E tests
#   stop:     Stop all services
#   clean:    Stop and remove volumes

set -euo pipefail

GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${GREEN}[DEV]${NC} $*"; }

case "${1:-up}" in
  up|start)
    log "Starting development environment..."
    podman compose up -d
    log "Services starting. Check status with: podman compose ps"
    log "API will be at: http://localhost:3001"
    log "Swagger docs: http://localhost:3001/docs"
    ;;

  logs)
    log "Following API logs (Ctrl+C to stop)..."
    podman compose logs -f "${2:-api}"
    ;;

  migrate|db)
    log "Running Prisma migrations..."
    podman compose exec api npx prisma migrate dev
    ;;

  seed)
    log "Seeding database..."
    podman compose exec api npx prisma db seed
    ;;

  studio)
    log "Opening Prisma Studio..."
    podman compose exec api npx prisma studio
    ;;

  test)
    log "Running unit tests..."
    podman compose exec api npm run test:run
    ;;

  test:e2e)
    log "Running E2E tests..."
    npm run test:e2e
    ;;

  stop)
    log "Stopping services..."
    podman compose stop
    ;;

  clean)
    log "Stopping services and removing volumes..."
    log "WARNING: This will delete all data!"
    read -p "Continue? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      podman compose down -v
      log "Cleaned."
    else
      log "Aborted."
    fi
    ;;

  ps|status)
    podman compose ps
    ;;

  *)
    echo "Usage: $0 {up|logs|migrate|seed|studio|test|test:e2e|stop|clean|ps}"
    echo ""
    echo "Commands:"
    echo "  up       Start all services (default)"
    echo "  logs     Follow logs (optionally: logs api, logs db)"
    echo "  migrate  Run Prisma migrations"
    echo "  seed     Seed the database"
    echo "  studio   Open Prisma Studio"
    echo "  test     Run unit tests"
    echo "  test:e2e Run E2E tests"
    echo "  stop     Stop all services"
    echo "  clean    Stop and remove volumes (DESTRUCTIVE)"
    echo "  ps       Show running services"
    exit 1
    ;;
esac
