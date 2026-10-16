# Eliminar `podman compose build` del proyecto (imágenes solo con `podman build`)

**Status:** done (verificado)

## Objective

Que ningún script, workflow, doc ni archivo compose del proyecto construya imágenes vía
`podman compose ... build`. Compose queda como orquestador puro: las imágenes se arman
con `podman build` y los servicios las referencian por tag fijo (`image:`), de modo que
compose **no pueda** construir ni queriendo.

## Problem

`podman compose build` falla en esta máquina porque el proveedor externo que usa
`podman compose` acá (el plugin `docker-compose`) **aborta** con `EACCES` al empaquetar
el contexto de build. El desarrollo local nunca se rompió porque `podman-pod/run.sh` ya
usaba `podman build` puro, que **sí tolera** el directorio ilegible.

Disparador real: `postgres-data/`, un directorio **heredado** del compose viejo (el que
hacía bind-mount `./postgres-data`), de `uid 100069`, ilegible para el usuario del host.
Y **sin uso**: `compose.yaml` pasó a usar el volumen nombrado `pv-postgres-data-dev`, y
`podman inspect pv-database` confirma que el contenedor dev vivo monta ese volumen, no el
directorio.

## Why

Decisión del usuario: **los dos caminos**.

1. Sacar el directorio muerto del contexto de build (higiene; elimina el fallo local).
2. Que compose no pueda construir en ningún lugar (garantía estructural, no cosmética).

## Scope

**In:** los 3 compose files, los scripts que construyen imágenes, el job `e2e` de CI, los
docs que instruyen el build, y el directorio heredado `postgres-data/`.

**Out:** cualquier cambio de comportamiento en runtime (env, puertos, volúmenes,
`depends_on`, healthchecks, `command`, `restart`, `container_name`, redes, secretos), el
código de la app (`src/`, `client/`), `tests/`, y `podman-pod/run.sh`.

## Constraints

- **No romper el despliegue**: Vercel (client), Render (api) y Neon (Postgres) no se
  tocan. El deploy real no pasa por estos compose files; estos son para dev local, el
  job de e2e y un stack prod-like autocontenido.
- El contenedor dev `pv-database` no se toca nunca; el teardown solo aplica al stack e2e
  (`compose.test.yaml`, proyecto `punto-venta-e2e`).
- Sin commits: el usuario maneja el control de versiones.

## Tasks

- [x] **T1** Sacar `postgres-data/` del repo → `../punto-venta-postgres-data-old`.
- [x] **T2** `compose.yaml`: `migrate` + `api` → `image: punto-venta-api` (mismo
  Containerfile ⇒ misma imagen, se comparte), `client` → `image: punto-venta-client`.
- [x] **T3** `compose.test.yaml`: `migrate` + `api` → `image: punto-venta-api-e2e`.
- [x] **T4** `podman-compose.prod.yml`: `api` → `image: punto-venta-api-prod`.
- [x] **T5** `scripts/dev.sh`: build explícito de api + client antes de `compose up`.
- [x] **T6** `scripts/prod.sh`: `up -d --build` → `podman build` + `up -d`.
- [x] **T7** `scripts/deploy.sh`: `compose build --no-cache` → `podman build --no-cache`.
- [x] **T8** `.github/workflows/ci.yml` job `e2e`: `compose build` → `podman build`
  (tag igual al que espera `compose.test.yaml`).
- [x] **T9** Docs: `docs/OPERATIONS.md` (4 puntos), `README.md` (2), `punto-venta_dev.md`
  (2), comentario de uso de `podman-compose.prod.yml`.
- [x] **T10** Verificación independiente + corrección de la regresión encontrada.

## Route (observabilidad de la delegación)

| Paso | Ruta | Evidencia del trigger |
| --- | --- | --- |
| T1 (mover el dir) | inline | operación de estado, 1 comando |
| T2–T9 | **delegado** | writer trigger: 10 archivos no-triviales de infra/config → 1 writer |
| T10 (verificación) | **delegado** | tier `high` (assess) + RDD `off` → verificador independiente read-only |
| Corrección (T10) | inline | 3 ediciones mecánicas de 1 línea (doc/comentario), sin diseño pendiente |

## Verification

| Chequeo | Comando | Resultado observado |
| --- | --- | --- |
| Compose no puede construir | `podman compose -f compose.test.yaml build` | `warning: No services to build`, exit 0 |
| Ídem dev y prod | `podman compose -f compose.yaml build` / `-f podman-compose.prod.yml build` | ídem |
| Los compose parsean | `podman compose -f <cada uno> config --services` | `db migrate api client` / `db migrate api` / `db api` |
| Cero builds por compose | barrida sobre scripts/workflows/docs | 0 hits (solo queda `--build-arg`, que no es un build de compose) |
| Flujo e2e completo | `podman build -t punto-venta-api-e2e ... && podman compose -f compose.test.yaml down -v && up -d` | el `up` **no** muestra actividad de build; `/health` → 200 |
| Suite e2e | `API_URL=http://localhost:3001 npx playwright test` | **38 passed**, exit 0 (dos corridas independientes) |
| Dev intacto | `podman inspect pv-database` antes/después | **mismo ID y mismo `StartedAt`**; `Up 4 hours (healthy)` |
| Deploy sin cambios | diff de `podman-compose.prod.yml` | mismo context/dockerfile/arg; solo `build:` → `image:` |
| Sin referencias colgadas | grep de nombres derivados viejos (`punto-venta_api`, `…-e2e_api`, …) | 0 referencias en scripts/docs/compose |

## Regresión encontrada y corregida

El writer actualizó el bloque de **producción** de `punto-venta_dev.md` §9.4 pero dejó
`podman compose up -d` (línea de desarrollo) **sin build previo**, y el comentario de
`./scripts/dev.sh up` en `README.md` decía "podman compose".

Con `build:` eliminado, ese comando ya no levanta el stack desde cero: compose no
construye, intenta hacer *pull* de `docker.io/library/punto-venta-api` y **falla**. Era
el único punto de entrada roto (lo detectó el verificador independiente, lo confirmó con
una prueba de imagen faltante).

Corregido: se agregaron los dos `podman build` antes de esa línea y se actualizó el
comentario del README. Re-verificado: **todos** los `compose up` del repo tienen un build
antes.

## Nota sobre `--build-arg NODE_ENV=production`

`api/Containerfile` **no declara `ARG NODE_ENV`** (ni ningún `ARG`), así que ese
`--build-arg` es **inerte** — y ya lo era en el compose original, donde era un `args:`
muerto. Se conservó por paridad con el build anterior, y el comentario en
`podman-compose.prod.yml` lo dice explícitamente para que nadie crea que importa.
`NODE_ENV` en runtime lo inyecta `environment:`.

## Gaps / riesgos residuales (honestos)

- **CI no verificable localmente.** El job `e2e` instala `podman` y usa `podman compose`,
  que delega en un proveedor externo (el plugin docker-compose). Esa dependencia es
  **pre-existente** (el paso viejo también era `podman compose ... build`), no la
  introduce este cambio; si el proveedor no está en el runner, el job falla igual que
  antes. No se pudo probar el runner desde acá.
- El build completo de **producción** (`api/Containerfile`) no se ejecutó; la inercia del
  `--build-arg` se probó genéricamente con un Containerfile de descarte.
- El repo quedó con **imágenes huérfanas** de los nombres que derivaba compose
  (`punto-venta_api`, `punto-venta_migrate`, `punto-venta-e2e_api`, …). Cosmético:
  `podman system prune` las limpia.
- Este doc se creó **después** de implementar y verificar (no antes del primer write).

## Next step

Commitear (el usuario). Archivos: 3 compose + 3 scripts + 1 workflow + 3 docs.
