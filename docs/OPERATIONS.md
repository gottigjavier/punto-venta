# Operations Guide — Punto de Venta

## 1. Stack Overview

| Component | Technology | Port | Health Check |
| ----------- | ----------- | ------ | ------------- |
| API | Fastify + Node 20 | 3001 | `GET /health` |
| Database | PostgreSQL 16 Alpine | 5432 (dev only) | `pg_isready` |

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

# Check status
./scripts/dev.sh ps
```

**Services will be available at:**

- API: <http://localhost:3001>
- Swagger docs: <http://localhost:3001/docs>
- Health: <http://localhost:3001/health>
- Readiness: <http://localhost:3001/ready>
- Metrics: <http://localhost:3001/metrics>
- PostgreSQL: localhost:5432

---

## 3. Development Commands

### Quick Reference

```bash
./scripts/dev.sh up         # Start services
./scripts/dev.sh logs       # Follow all logs
./scripts/dev.sh logs api   # Follow API logs only
./scripts/dev.sh migrate    # Run Prisma migrations
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
| --------- | ------------ | ------------ |
| Port exposure | All services exposed | Only API exposed |
| Swagger docs | Enabled | Disabled |
| Log level | debug | info (configurable) |
| Log format | pino-pretty (human) | JSON (machine) |
| Health checks | 30s interval | 30s interval |
| Resource limits | None | 512MB API, 512MB DB |
| Log rotation | None | max-size + max-file |
| Secrets | .env file | Podman secrets |

---

## 5. Health Checks & Monitoring

### Endpoints

| Endpoint | Method | Purpose | Expected |
| ---------- | -------- | --------- | ---------- |
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

> Hay **dos caminos de producción**. No los mezcles: la estrategia de
> backup/restore es diferente para cada uno.
>
> - **Cloud (recomendado / el que está activo)**: frontend → Vercel, backend →
>   Render, DB → **Neon**. El backup de la base lo provee Neon (PITR + branch);
>   NO corras un `pg_dump` en crontab contra Neon (es redundante con Neon).
> - **Self-host**: `podman-compose.prod.yml` + `scripts/backup.sh` /
>   `scripts/restore.sh` contra el contenedor `pv-db-prod`. Sirve para quien
>   prefiere salir de los proveedores y alojar la DB en su propio Podman.

### 6.1 Cloud path (Neon) — primary

La DB de producción vive en **Neon**. El backup **no lo hacés vos**: Neon ofrece
punto de recuperación en el tiempo (PITR), branches y snapshots de
almacenamiento. Esta es tu ALTA disponibilidad y tu recovery primario.

- **PITR**: restaurar la DB a cualquier segundo dentro de la ventana de
  retención de tu plan. Es el mecanismo de recovery ante un borrado o corrupción.
- **Branches**: creá una branch a partir de un timestamp sin tocar producción;
  ideal para probar una migración o reproducir un bug.

```bash
# List branches / TIMELINE
neonctl branches list

# Crear una branch a partir de un punto en el tiempo (rollback a un snapshot)
neonctl branches create \
  --name rollback-$(date +%Y%m%d) \
  --parent <main-branch-id> \
  --parent-timestamp "2026-09-15 10:00:00"

# Promover la branch a nueva principal (o apuntar la conexión a la branch)
neonctl branches promote --name rollback-$(date +%Y%m%d)
```

Recomendaciones:

1. **Verificá la retención de PITR** de tu plan de Neon y ajustala a tu RPO
   objetivo (los planes free tienen una ventana corta).
2. **Copia fuera del proveedor (defensa en profundidad, opcional)**: si querés
   que el backup sobreviva a un borrado accidental del proyecto de Neon, exportá
   un `pg_dump` a un bucket (S3/Backblaze) con baja frecuencia. No es el respaldo
   primario; es un seguro.

### 6.2 Self-host path (Podman) — alternativa

Aplica cuando la DB corre en un contenedor `pv-db-prod` bajo `podman-compose.prod.yml`.

#### Automated Backups

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

`backup.sh` detecta la password de la DB desde el secret montado
(`/run/secrets/db_password`). Si no está montado, cae a trust-auth por socket
(unix) dentro del contenedor.

#### Backup Details

- **Format**: Custom PostgreSQL format (compressed with gzip level 9)
- **Location**: `/backups/punto-venta/` (configurable)
- **Naming**: `backup_YYYYMMDD_HHMMSS.sql.gz`
- **Retention**: 30 days (configurable via `RETENTION_DAYS`)
- **Integrity**: Verified with `gzip -t` after creation
- **Verification**: `pg_restore --list` (if pg_restore is available)

#### Restore

```bash
# List available backups
ls -la /backups/punto-venta/

# Inspect a backup's TOC without touching the DB
./scripts/restore.sh --list /backups/punto-venta/backup_20260714_020000.sql.gz

# Validate a backup without restoring
./scripts/restore.sh --dry-run /backups/punto-venta/backup_20260714_020000.sql.gz

# Restore (WARNING: overwrites current data, prompts for confirmation)
./scripts/restore.sh /backups/punto-venta/backup_20260714_020000.sql.gz

# With custom container
./scripts/restore.sh /backups/punto-venta/backup_20260714_020000.sql.gz pv-db-prod
```

`restore.sh` hace un drop/recreate del schema `public` antes de restaurar (limpieza
completa), lee la password del secret si está disponible y pide confirmación
antes de sobrescribir. Usa `--no-owner --role=<db_user>` para evitar problemas
de ownership al restaurar con un rol distinto.

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
| ---------- | --------- | ------------- |
| `DATABASE_URL` | — | PostgreSQL connection string (required) |
| `JWT_SECRET` | — | Access token secret, min 32 chars (required) |
| `JWT_REFRESH_SECRET` | — | Refresh token secret, min 32 chars (required) |

| `NODE_ENV` | `development` | `development` / `staging` / `production` / `test` |
| `API_PORT` | `3001` | API server port |
| `TRUST_PROXY_HOPS` | `0` | Trusted reverse-proxy hops for `trustProxy`. `0` = disabled (API exposed directly); set to the exact hop count (usually `1`) behind a trusted proxy (Render, Nginx) so the client IP cannot be spoofed |
| `FRONTEND_URL` | `http://localhost:5173` | Frontend URL for CORS (Vite dev server) |
| `LOG_LEVEL` | `info` | `error` / `warn` / `info` / `debug` / `trace` |
| `METRICS_TOKEN` | — | Bearer token required to scrape `/metrics` (optional). If unset in production, `/metrics` is not exposed (403) |
| `RATE_LIMIT_WINDOW_MS` | `3600000` | Rate limit window (1 hour) |
| `RATE_LIMIT_MAX_REQUESTS` | `10` | Max requests per window (global rate limiter) |
| `RATE_LIMIT_ENABLED` | — | `true` / `false` — explicit global rate-limit toggle (optional). Unset → enabled in production/staging, disabled in development/test |
| `LOGIN_RATE_LIMIT_MAX` | `5` | Max `/login` attempts per window, per IP (stricter than the global limiter) |
| `LOGIN_RATE_LIMIT_WINDOW_MS` | `60000` | `/login` rate limit window (1 minute) |
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
- **No exposed ports**: Only API port is exposed in production (database is internal).
- **Log rotation**: All production containers have log rotation configured.
- **Resource limits**: All production containers have memory limits.
- **HTTPS**: Must be configured at the reverse proxy level (nginx, Traefik, etc.).
