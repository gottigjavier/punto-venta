#!/usr/bin/env bash
# Uso: podman-pod/run.sh
# Levanta el pod pv-pod (Postgres + API + cliente Vite) publicando SOLO el
# puerto 5173 en el host. Construye las imágenes locales si faltan y aplica las
# migraciones de Prisma (idempotente).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

POD=pv-pod

# ─── 1. Imágenes locales ──────────────────────────────────────────────
if ! podman image exists localhost/punto-venta-api:latest; then
  echo "=== Construyendo imagen punto-venta-api ==="
  podman build -t punto-venta-api -f api/Containerfile.dev .
fi

if ! podman image exists localhost/punto-venta-client:latest; then
  echo "=== Construyendo imagen punto-venta-client ==="
  podman build -t punto-venta-client -f client/Containerfile client
fi

# ─── 2. Pod ───────────────────────────────────────────────────────────
echo "=== Creando pod con solo puerto 5173 expuesto ==="
podman play kube --replace podman-pod/pod.yaml

# ─── 3. Esperar a Postgres ────────────────────────────────────────────
echo "=== Esperando a Postgres ==="
for i in $(seq 1 30); do
  if podman exec "$POD-pv-database" pg_isready -U postgres >/dev/null 2>&1; then
    echo "Postgres listo"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "Postgres no respondió a tiempo" >&2
    exit 1
  fi
  sleep 2
done

# ─── 4. Migraciones (idempotente) ─────────────────────────────────────
# OJO: NO usar `podman run --pod pv-pod` para esto. El pod tiene
# restartPolicy: Always, y esa política aplica a CUALQUIER contenedor que se
# una al pod: un job de un solo uso (migrate) sale con código 0 y podman lo
# reinicia en loop infinito, arrastrando al pod entero a un stop/start.
# `podman exec` corre dentro del contenedor ya existente: sin política de
# reinicio y con DATABASE_URL / prisma / prisma.config.ts ya montados.
echo "=== Aplicando migraciones ==="
podman exec "$POD-pv-api" npx prisma migrate deploy

# ─── 5. Esperar al cliente ────────────────────────────────────────────
echo "=== Esperando al cliente Vite ==="
for i in $(seq 1 30); do
  if curl -fsS -o /dev/null --max-time 2 http://localhost:5173/ 2>/dev/null; then
    echo "Cliente listo en http://localhost:5173"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "El cliente no respondió a tiempo" >&2
    exit 1
  fi
  sleep 2
done

# ─── 6. Estado ────────────────────────────────────────────────────────
echo "=== Estado del pod ==="
podman ps --pod --format '{{.Names}}\t{{.Status}}'
echo "=== Puertos publicados al host (debe ser SOLO 5173) ==="
podman pod inspect "$POD" --format '{{range $p, $c := .InfraConfig.PortBindings}}{{$p}} => host {{(index $c 0).HostPort}}{{"\n"}}{{end}}'
echo "=== Smoke test del proxy (401 sin token = API OK) ==="
curl -s -o /dev/null -w 'GET /api/v1/productos -> %{http_code}\n' --max-time 5 http://localhost:5173/api/v1/productos
echo
echo "Cliente:  http://localhost:5173"
echo "Logs:     podman logs -f $POD-pv-api   |   podman logs -f $POD-pv-client   |   podman logs -f $POD-pv-database"
