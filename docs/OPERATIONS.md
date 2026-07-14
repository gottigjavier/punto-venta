# Operations Guide — Punto de Venta

## 1. Stack Overview

| Component | Technology | Port | Health Check |
|-----------|-----------|------|-------------|
| API | Fastify + Node 20 | 3001 | `GET /health` |
| Database | PostgreSQL 16 Alpine | 5432 (dev only) | `pg_isready` |
| Cache | Redis 7 Alpine | 6379 (dev only) | `redis-cli ping` |

- **Containers**: Podman (rootless, daemonless)
- **VCS**: Jujutsu (jj) — colocated with Git
- **CI/CD**: GitHub Actions + Podman

---

## 2. Initial Setup

### Prerequisites

```bash
# Install Podman
sudo apt-get install podman podman-compose

# Install Jujutsu
cargo install jj-cli
# Or: brew install jujutsu

# Install Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Clone & Configure

```bash
# Clone the repository
jj git clone <repo-url> punto-venta
cd punto-venta

# Copy environment file
cp .env.example .env
# Edit .env with your values (JWT secrets, DB URL, etc.)

# Create secrets directory for production
mkdir -p secrets
echo "your-db-password" > secrets/db_password.txt
```

### First Run (Development)

```bash
# Start all services
./scripts/dev.sh up

# Run database migrations
./scripts/dev.sh migrate

# Seed initial data (optional)
./scripts/dev.sh seed

# Check status
./scripts/dev.sh ps
```

**Services will be available at:**
- API: http://localhost:3001
- Swagger docs: http://localhost:3001/docs
- Health: http://localhost:3001/health
- Readiness: http://localhost:3001/ready
- Metrics: http://localhost:3001/metrics
- PostgreSQL: localhost:5432
- Redis: localhost:6379

---

## 3. Development Commands

### Quick Reference

```bash
./scripts/dev.sh up         # Start services
./scripts/dev.sh logs       # Follow all logs
./scripts/dev.sh logs api   # Follow API logs only
./scripts/dev.sh migrate    # Run Prisma migrations
./scripts/dev.sh seed       # Seed database
./scripts/dev.sh test       # Run unit tests
./scripts/dev.sh test:e2e   # Run E2E tests
./scripts/dev.sh stop       # Stop services
./scripts/dev.sh clean      # Stop + remove volumes (DESTRUCTIVE)
./scripts/dev.sh ps         # Show running services
```

### Direct Podman Commands

```bash
# View running containers
podman compose ps

# View logs with timestamps
podman compose logs -f --timestamps api

# Execute command in running container
podman compose exec api npx prisma migrate dev
podman compose exec api npx prisma studio
podman compose exec api node -e "console.log(process.version)"

# Rebuild a specific service
podman compose build api --no-cache

# Prune unused resources
podman system prune -f
podman volume prune -f
```

---

## 4. Production Commands

### Start Production

```bash
# Ensure secrets are configured
export JWT_SECRET="your-32-char-minimum-secret"
export JWT_REFRESH_SECRET="your-32-char-minimum-refresh-secret"

# Start
./scripts/prod.sh up

# Or manually
podman compose -f podman-compose.prod.yml up -d --build
```

### Production Script Commands

```bash
./scripts/prod.sh up        # Build and start production
./scripts/prod.sh stop      # Stop (preserves state)
./scripts/prod.sh down      # Stop and remove containers
./scripts/prod.sh logs      # Follow logs
./scripts/prod.sh migrate   # Run production migrations
./scripts/prod.sh restart   # Restart API
./scripts/prod.sh ps        # Show status
```

### Deployment

```bash
# Full deploy (pull, backup, build, migrate, deploy)
./scripts/deploy.sh

# Or step by step
jj pull && jj update
podman compose -f podman-compose.prod.yml build
podman compose -f podman-compose.prod.yml up -d
```

### Production Differences from Development

| Feature | Development | Production |
|---------|------------|------------|
| Port exposure | All services exposed | Only API exposed |
| Swagger docs | Enabled | Disabled |
| Log level | debug | info (configurable) |
| Log format | pino-pretty (human) | JSON (machine) |
| Health checks | 30s interval | 30s interval |
| Resource limits | None | 512MB API, 512MB DB, 256MB Redis |
| Log rotation | None | max-size + max-file |
| Secrets | .env file | Podman secrets |

---

## 5. Health Checks & Monitoring

### Endpoints

| Endpoint | Method | Purpose | Expected |
|----------|--------|---------|----------|
| `/health` | GET | Liveness probe — is the process alive? | Always 200 |
| `/ready` | GET | Readiness probe — can it serve traffic? | 200 (OK) or 503 (not ready) |
| `/metrics` | GET | Performance metrics | Always 200 |

### Health Check Response

```json
{
  "status": "ok",
  "timestamp": "2026-07-14T12:00:00.000Z",
  "uptime": 86400,
  "environment": "production",
  "version": "3.0.0",
  "memory": {
    "rss_mb": 45,
    "heap_used_mb": 20,
    "heap_total_mb": 35
  }
}
```

### Readiness Check Response

```json
{
  "status": "ready",
  "timestamp": "2026-07-14T12:00:00.000Z",
  "version": "3.0.0",
  "services": {
    "database": "connected",
    "prisma": "operational"
  },
  "checks": [
    { "name": "database", "status": "connected", "latency_ms": 2 },
    { "name": "prisma", "status": "operational", "latency_ms": 5 }
  ]
}
```

### Monitoring with Podman

```bash
# Check container health status
podman inspect --format='{{.State.Health.Status}}' pv-api-prod

# View health check history
podman inspect --format='{{json .State.Health}}' pv-api-prod | jq

# Check resource usage
podman stats --no-stream
```

---

## 6. Backup & Restore

### Automated Backups

```bash
# Manual backup
./scripts/backup.sh

# With custom container and directory
./scripts/backup.sh pv-db-prod /custom/backup/path

# Cron job (add to crontab with: crontab -e)
# Daily at 2 AM
0 2 * * * /path/to/scripts/backup.sh >> /var/log/punto-venta-backup.log 2>&1

# Every 6 hours
0 */6 * * * /path/to/scripts/backup.sh >> /var/log/punto-venta-backup.log 2>&1
```

### Backup Details

- **Format**: Custom PostgreSQL format (compressed with gzip level 9)
- **Location**: `/backups/punto-venta/` (configurable)
- **Naming**: `backup_YYYYMMDD_HHMMSS.sql.gz`
- **Retention**: 30 days (configurable via `RETENTION_DAYS`)
- **Integrity**: Verified with `gzip -t` after creation
- **Verification**: `pg_restore --list` (if pg_restore is available)

### Restore

```bash
# List available backups
ls -la /backups/punto-venta/

# Restore from backup (WARNING: this overwrites current data!)
gunzip -c /backups/punto-venta/backup_20260714_020000.sql.gz | \
  podman exec -i pv-db-prod pg_restore -U pv_user -d punto_venta --clean --if-exists

# Or using pg_dump custom format
podman exec -i pv-db-prod pg_restore -U pv_user -d punto_venta \
  --clean --if-exists < /backups/punto-venta/backup_20260714_020000.sql.gz
```

### Backup Monitoring

```bash
# Check backup logs
tail -f /var/log/punto-venta-backup.log

# Check disk usage
du -sh /backups/punto-venta/
ls -la /backups/punto-venta/ | wc -l  # count backups
```

---

## 7. Troubleshooting

### Common Issues

#### Container won't start

```bash
# Check logs
podman compose logs api

# Check if port is in use
lsof -i :3001

# Rebuild from scratch
podman compose down
podman compose build api --no-cache
podman compose up -d api
```

#### Database connection refused

```bash
# Check if DB is running and healthy
podman compose ps db
podman compose logs db

# Test connection manually
podman compose exec db psql -U postgres -d punto_venta_dev

# Check health
podman compose exec db pg_isready -U postgres
```

#### Prisma migration errors

```bash
# Check migration status
podman compose exec api npx prisma migrate status

# Reset database (DEVELOPMENT ONLY!)
podman compose exec api npx prisma migrate reset

# Generate client after schema changes
podman compose exec api npx prisma generate
```

#### API returning 503 on /ready

```bash
# Check which service is down
curl http://localhost:3001/ready | jq

# Usually: database is down
podman compose ps db
podman compose logs db --tail 50
```

#### Out of memory

```bash
# Check container resource usage
podman stats --no-stream

# Check API memory
curl http://localhost:3001/health | jq '.memory'

# Increase limits in podman-compose.prod.yml
```

### Log Analysis

```bash
# Search for errors in API logs
podman compose logs api 2>&1 | grep -i error

# Find slow requests (> 200ms)
podman compose logs api 2>&1 | grep "Slow request"

# JSON log analysis (production)
podman compose logs api 2>&1 | jq 'select(.level == "error")'

# Count requests by status code
podman compose logs api 2>&1 | jq -r '.statusCode' | sort | uniq -c
```

---

## 8. Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | PostgreSQL connection string (required) |
| `JWT_SECRET` | — | Access token secret, min 32 chars (required) |
| `JWT_REFRESH_SECRET` | — | Refresh token secret, min 32 chars (required) |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `NODE_ENV` | `development` | `development` / `staging` / `production` |
| `API_PORT` | `3001` | API server port |
| `FRONTEND_URL` | `http://localhost:3000` | Frontend URL for CORS |
| `LOG_LEVEL` | `info` | `error` / `warn` / `info` / `debug` / `trace` |
| `RATE_LIMIT_WINDOW_MS` | `3600000` | Rate limit window (1 hour) |
| `RATE_LIMIT_MAX_REQUESTS` | `10` | Max login attempts per window |
| `MAX_LOGIN_ATTEMPTS` | `3` | Failed attempts before lockout |
| `LOCKOUT_DURATION_MINUTES` | `30` | Account lockout duration |
| `POSTGRES_USER` | `pv_user` | PostgreSQL user (production) |

---

## 9. CI/CD Pipeline

The project uses GitHub Actions with Podman (not Docker).

### Pipeline Stages

1. **Lint & Type Check** — TypeScript compilation, ESLint
2. **Unit & Integration Tests** — Vitest with PostgreSQL service
3. **E2E Tests** — Playwright with Podman containers
4. **Build & Push** — Multi-stage Containerfile, push to GHCR (main branch only)

### Trigger Events

- **Push to `main` or `develop`**: Runs full pipeline + builds images
- **Pull request to `main`**: Runs tests only (no image build)

### Viewing Pipeline

```bash
# Via GitHub CLI
gh run list
gh run view <run-id>

# Logs
gh run view <run-id> --log
```

---

## 10. Security Notes

- **Secrets**: Never commit `secrets/` directory. Use `.gitignore` / `.jjignore`.
- **Container user**: All containers run as non-root (`appuser:1001`).
- **Network isolation**: Production services communicate via internal bridge network.
- **No exposed ports**: Only API port is exposed in production (DB, Redis are internal).
- **Log rotation**: All production containers have log rotation configured.
- **Resource limits**: All production containers have memory limits.
- **HTTPS**: Must be configured at the reverse proxy level (nginx, Traefik, etc.).
