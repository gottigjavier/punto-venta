# Punto de Venta

Sistema de **Punto de Venta (POS)** full-stack para el manejo de ventas, stock, proveedores y cierres de caja. Construido con **Fastify + Prisma 7 + PostgreSQL** en el backend y **React + TypeScript + shadcn/ui** en el frontend.

Pensado para el contexto local (es-AR): terminal de venta con grilla de productos, carrito de venta, cierres de caja con clave, administración de ventas con exportación CSV, stock con vencimiento y alertas, y gestión de usuarios con roles.

## Características

- **Terminal POS** (`/ventas`): grilla de productos agrupada por rubro, ordenada por "más vendidos" (última fecha de venta), carrito que se congela tras confirmar una venta mostrando importe e ítems, e ingreso de cantidades (incluso decimales para venta a granel).
- **Ventas / Cierres de caja**: apertura y cierre de caja (`CierreCaja`) con clave, historial de ventas filtrado al período de caja activo; borrar una venta archivada está bloqueado.
- **Administración** (`/administracion`): detalle de cierre de caja con desglose por venta y por producto, filtros y **exportación CSV**.
- **Stock** (`/stock`): inventario con **fecha de vencimiento** (`fecha_vencimiento`) y **cantidad de aviso** (`cantidad_aviso`) para alertas de stock bajo; ingreso y edición de productos.
- **Productos, Proveedores y Rubros**: CRUD completo con validación (Zod) y paginación.
- **Usuarios** (`/usuarios`): CRUD, **solo admin**.
- **Autenticación**: login JWT (access + refresh en cookie httpOnly), con rate limiting y bloqueo de cuenta.
- **Documentación de la API**: Swagger UI (OpenAPI 3.0.0) en `/docs`.

## Stack tecnológico

| Capa | Tecnología | Versión |
|------|------------|---------|
| Runtime | Node.js | 20+ |
| Backend | Fastify | 5.x (`^5.10.0`) |
| ORM | Prisma | 7.x (`^7.8.0`) |
| Base de datos | PostgreSQL | 16 (Neon en producción) |
| Auth | JWT + bcrypt | jsonwebtoken `^9`, bcryptjs `^3` |
| Validación | Zod | 4.x (`^4.4.3`) |
| Resultados | neverthrow | `^8.2.0` |
| Logging | pino | `^10.3.1` |
| Testing | Vitest + Playwright | Vitest `^4`, Playwright `^1.61` |
| Frontend | React + TypeScript | React `^19.0.0` |
| Bundler FE | Vite | `^6.0.0` |
| UI FE | shadcn/ui (Radix UI + Tailwind CSS) | Tailwind `^3.4.0` |
| Contenedores | Podman / podman-compose | - |
| Deploy BE | Render | - |
| Deploy FE | Vercel | - |
| VCS | Jujutsu (jj) colocado con git | - |

## Arquitectura

El backend sigue una arquitectura **hexagonal (puertos y adaptadores)**, separando el dominio de la infraestructura y los adaptadores HTTP:

```
src/
├── domain/              # Entidades, value objects, errores (ej. Usuario, Rol)
├── application/         # Casos de uso y DTOs (Zod schemas en application/dto)
├── infrastructure/      # Config (env.ts), logging, DB (Prisma), auth, swagger
├── adapters/            # HTTP: controllers y routes (Fastify)
│   └── http/routes/     # auth, usuario, producto, proveedor, rubro, stock, venta
├── shared/              # Tipos y utilidades compartidas
└── main.ts              # Bootstrap del servidor Fastify
```

**API REST** bajo el prefijo `/api/v1` (ver `src/main.ts`): `/api/v1/auth`, `/api/v1/usuarios`, `/api/v1/productos`, `/api/v1/proveedores`, `/api/v1/rubros`, `/api/v1/stock`, `/api/v1/ventas`.

**Documentación**: Swagger/OpenAPI 3.0.0 registrado en `src/infrastructure/swagger/swagger.ts`, UI en `/docs` y spec crudo en `/docs/json`.

**Topología de despliegue**:
- Backend (Fastify) en **Render** (`render.yaml`, plan free, región oregon).
- Base de datos **PostgreSQL en Neon** (string de conexión vía `DATABASE_URL`, `sync: false` en Render).
- Frontend (React/Vite) en **Vercel**. En producción, `client/vercel.json` reescribe `/api/v1/*` al backend de Render.

## Roles y permisos

Los roles se definen en el enum `Rol` (`prisma/schema.prisma`) y en la entidad de dominio `src/domain/entities/usuario.ts`:

```ts
rol: 'admin' | 'gerente' | 'despachador';
```

| Rol | Acceso |
|-----|--------|
| `admin` | Acceso completo a todos los módulos, **incluida la gestión de Usuarios**. |
| `gerente` | CRUD en productos, proveedores, rubros, stock y ventas (no gestiona usuarios). |
| `despachador` | Restringido a **Ventas (POS) + Stock**. La sección de Usuarios está bloqueada. |

La sección **Usuarios es exclusiva de `admin`**, y está protegida en **dos capas**:
- **UI** (`client/src/App.tsx`): `ADMIN_ONLY_PATHS = ['/usuarios']` redirige a cualquier rol no admin. `ROLE_ALLOWED_PATHS` restringe a `despachador` a `['/ventas', '/stock']`.
- **Backend** (`src/adapters/http/routes/usuario.routes.ts`): `fastify.addHook('preHandler', authorize('admin'))` en todas las rutas de usuarios.

## Estructura del proyecto

```
punto-venta/
├── package.json            # Backend (Fastify) - scripts dev/build/prisma/test
├── prisma/
│   ├── schema.prisma       # Modelos: Usuario, Producto, Proveedor, Rubro, Venta, DetalleVenta, CierreCaja...
│   └── seed.ts             # Seed: usuario admin + rubros + proveedor de ejemplo
├── src/                    # Código fuente del backend (domain/application/adapters/infrastructure)
├── client/                 # Frontend React + Vite + shadcn/ui
│   ├── package.json        # Scripts dev/build/preview/lint/test
│   ├── src/pages/          # Login, Ventas, Stock, Productos, Proveedores, Rubros, Usuarios, Administracion
│   ├── vercel.json         # Rewrite /api/v1/* -> backend Render
│   └── vite.config.ts      # Proxy /api -> localhost:3001 (dev)
├── scripts/                # dev.sh, deploy.sh, backup.sh, prod.sh
├── api/                    # Containerfiles (deploy en Render)
├── docs/                   # OPERATIONS.md
├── render.yaml             # Blueprint de deploy del backend en Render
├── podman-compose.yml      # Dev local con Podman
└── .env.example            # Variables de entorno (template)
```

## Prerrequisitos

- **Node.js 20+**
- **bun** (recomendado) o **npm**
- Una base de datos **PostgreSQL** (local con Podman, o **Neon** en producción)
- **Jujutsu (jj)** para el control de versiones (opcional, el repo también es git)

## Configuración del entorno

Copiá `.env.example` a `.env` y completá los valores. Las variables reales (validadas con Zod en `src/infrastructure/config/env.ts`) son:

| Variable | Descripción | Default |
|----------|-------------|---------|
| `DATABASE_URL` | String de conexión PostgreSQL (`postgresql://user:pass@host:5432/db`) | — (requerida) |
| `JWT_SECRET` | Secreto del access token (mín. 32 chars) | — (requerida) |
| `JWT_REFRESH_SECRET` | Secreto del refresh token (mín. 32 chars) | — (requerida) |
| `NODE_ENV` | `development` \| `staging` \| `production` | `development` |
| `PORT` | Puerto del servidor (opcional, sobreescribe `API_PORT`) | — |
| `API_PORT` | Puerto del API (usado si `PORT` no está) | `3001` |
| `FRONTEND_URL` | URL del frontend para CORS (con protocolo y puerto) | — (requerida) |
| `RATE_LIMIT_WINDOW_MS` | Ventana de rate limiting (ms) | `3600000` |
| `RATE_LIMIT_MAX_REQUESTS` | Máx. intentos de login por ventana | `10` |
| `MAX_LOGIN_ATTEMPTS` | Intentos fallidos antes de bloqueo | `3` |
| `LOCKOUT_DURATION_MINUTES` | Duración del bloqueo (min) | `30` |
| `LOG_LEVEL` | `error`\|`warn`\|`info`\|`debug`\|`trace` | `info` |

Ejemplo mínimo de `.env` para desarrollo local:

```dotenv
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/punto_venta_dev
JWT_SECRET=cambia-esto-por-un-string-seguro-de-al-menos-32-chars-001
JWT_REFRESH_SECRET=cambia-esto-por-otro-string-seguro-de-al-menos-32-002
NODE_ENV=development
API_PORT=3001
FRONTEND_URL=http://localhost:5173
RATE_LIMIT_WINDOW_MS=3600000
RATE_LIMIT_MAX_REQUESTS=10
MAX_LOGIN_ATTEMPTS=3
LOCKOUT_DURATION_MINUTES=30
LOG_LEVEL=info
```

## Instalación

El backend vive en la raíz y el frontend en `client/`. Instalá dependencias en ambos:

```bash
# Backend (raíz)
bun install          # o: npm install

# Frontend
cd client
bun install          # o: npm install
cd ..
```

También podés levantar todo con Podman (ver `scripts/dev.sh`).

## Base de datos

Generá el cliente de Prisma y aplicá las migraciones. En desarrollo:

```bash
bun run prisma:migrate     # prisma migrate dev
bun run prisma:seed        # tsx prisma/seed.ts
```

En producción usá `bun run prisma:migrate:prod` (`prisma migrate deploy`).

El seed crea:
- Un **usuario admin** con `nik_usuario: user` / `password: password` (rol `admin`).
- Rubros de ejemplo (Panadería, Lácteos, Bebidas, Snacks, Limpieza).
- Un proveedor de ejemplo (Distribuidora Ejemplo S.A., CUIT `30-71234567-9`).

> ⚠️ Cambiá la contraseña del admin en producción.

## Ejecución en desarrollo

Terminal 1 — backend (Fastify en `http://localhost:3001`):

```bash
bun run dev              # tsx watch src/main.ts
```

Terminal 2 — frontend (Vite en `http://localhost:5173`, proxy `/api` → `localhost:3001`):

```bash
cd client
bun run dev              # vite
```

El cliente consume la API vía `/api/v1` (`client/src/lib/api-client.ts`, `baseURL: '/api/v1'`). En dev, el proxy de Vite redirige `/api` al backend; en producción lo hace el rewrite de Vercel.

> Nota: `FRONTEND_URL` debe coincidir con el origen desde donde se sirve el frontend (Vite usa el puerto `5173` por defecto).

## Documentación de la API

Swagger UI (OpenAPI 3.0.0) está habilitado en el código (`registerSwagger` en `src/main.ts`):

- UI: `http://localhost:3001/docs`
- Spec crudo (JSON): `http://localhost:3001/docs/json`

En producción la ruta `/docs` no se loguea pero sigue disponible. Todos los endpoints protegidos requieren `Authorization: Bearer <token>`.

### Endpoints principales

**Autenticación** (`/api/v1/auth`)
- `POST /login` · `POST /refresh` · `POST /logout`

**Productos** (`/api/v1/productos`)
- `GET` (paginado, filtros) · `POST` · `PUT /:id` · `DELETE /:id`

**Proveedores** (`/api/v1/proveedores`)
- `GET` · `POST` · `PUT /:id` · `DELETE /:id`

**Rubros** (`/api/v1/rubros`)
- `GET` · `POST` · `PUT /:id` · `DELETE /:id`

**Stock** (`/api/v1/stock`)
- `GET` (inventario con alertas) · `POST /ingreso` · `PUT /:id`

**Ventas** (`/api/v1/ventas`)
- `GET` (historial) · `POST` (crea venta en transacción atómica)
- `GET /resumen/dia` · `GET /ultimas-ventas` (usa `DISTINCT ON` en PostgreSQL; alimenta el orden "más vendidos" y la cantidad sugerida del POS)

**Usuarios** (`/api/v1/usuarios`, **solo admin**)
- `GET` · `POST` · `PUT /:id` · `DELETE /:id` (desactiva, no elimina)

**Health / Métricas**
- `GET /health` · `GET /ready` · `GET /metrics`

## Validación de Entrada (decisión arquitectónica)

La validación de entrada es responsabilidad **única de Zod** (DTOs en `src/application/dto/*.dto.ts`). Los handlers hacen `XSchema.safeParse(request.query|body|params)` y responden con `VALIDATION_ERROR` (mensaje en español).

Los schemas `querystring`/`body`/`params` de Fastify en `src/adapters/http/routes/*.routes.ts` fueron **eliminados** a propósito: dos fuentes de verdad (Fastify + Zod) provocaban divergencia silenciosa.

**Excepción**: rutas donde el handler no usa Zod conservan su schema de Fastify:
- `GET /api/v1/productos/search` (validación manual `if q.length < 3`)
- `POST /api/v1/auth/unlock/:userId` (regex manual de UUID)

## Despliegue

- **Backend**: Render a partir de `render.yaml` (build: `npm ci && npx prisma generate && npm run build`; start: `npx prisma migrate deploy && node dist/main.js`; health check en `/health`). `PORT` lo inyecta Render; `DATABASE_URL`, `JWT_SECRET` y `JWT_REFRESH_SECRET` se configuran como secretos (`sync: false`).
- **Base de datos**: PostgreSQL en **Neon**, apuntada por `DATABASE_URL`.
- **Frontend**: Vercel. `client/vercel.json` reescribe `/api/v1/(.*)` al backend de Render (`https://punto-venta-api-5duo.onrender.com/api/v1/$1`), de modo que el cliente siempre llama a `/api/v1` sin importar el entorno.

Despliegue manual con Podman:

```bash
podman compose -f podman-compose.prod.yml up -d --build
# o: ./scripts/deploy.sh
```

## Scripts útiles

### Backend (raíz)

| Script | Descripción |
|--------|-------------|
| `bun run dev` | Servidor en watch (`tsx watch src/main.ts`) |
| `bun run build` | Compila con `tsc` a `dist/` |
| `bun run start` | Ejecuta `node dist/main.js` |
| `bun run prisma:generate` | Genera el cliente Prisma |
| `bun run prisma:migrate` | `prisma migrate dev` (desarrollo) |
| `bun run prisma:migrate:prod` | `prisma migrate deploy` (producción) |
| `bun run prisma:seed` | Ejecuta el seed |
| `bun run prisma:studio` | Prisma Studio |
| `bun run lint` | ESLint |
| `bun run test` / `test:run` / `test:coverage` | Vitest |
| `bun run test:e2e` | Playwright E2E |

### Frontend (`client/`)

| Script | Descripción |
|--------|-------------|
| `bun run dev` | Vite dev server (puerto 5173) |
| `bun run build` | `tsc -b && vite build` |
| `bun run preview` | Preview del build |
| `bun run lint` | ESLint |
| `bun run test` | Vitest |

### Helpers (`scripts/dev.sh`)

```bash
./scripts/dev.sh up         # Levanta servicios (podman compose)
./scripts/dev.sh logs       # Sigue logs
./scripts/dev.sh migrate    # Migraciones Prisma
./scripts/dev.sh seed       # Seed de datos iniciales
./scripts/dev.sh test       # Tests unitarios
./scripts/dev.sh test:e2e   # Tests E2E
./scripts/dev.sh stop       # Detiene servicios
./scripts/dev.sh clean      # Detiene y elimina volúmenes
```

## Usuarios por defecto

| Nik | Contraseña | Rol |
|-----|------------|-----|
| `user` | `password` | `admin` |

## Seguridad

- Contraseñas hasheadas con **bcrypt** (salt rounds 12).
- JWT access tokens (15 min) + refresh tokens (7 días, cookie httpOnly).
- Rate limiting: 10 intentos por IP por hora (en producción).
- Bloqueo de cuenta tras 3 intentos fallidos (30 min).
- CORS restringido a `FRONTEND_URL`.
- Containers corren como non-root.

## Monitoreo

- Health checks (`/health`, `/ready`) cada 30s.
- Request logging estructurado con `pino`.
- Métricas en `/metrics`: uptime, request count, error rate, avg response time.
- Log rotation en producción.

## Notas de desarrollo

- El proyecto usa **Jujutsu (jj)** colocado con git (`jj git clone ...`).
- Se recomiendan **conventional commits** para el historial.
- El backend y el frontend se desarrollan por separado; en dev el proxy de Vite conecta el cliente con la API.

## Licencia

ISC
