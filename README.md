# Punto de Venta API

Sistema de punto de venta para manejo de ventas, stock y proveedores. Construido con Fastify, Prisma, PostgreSQL y Podman.

## Stack Tecnológico

| Capa | Tecnología | Versión |
|------|------------|---------|
| Runtime | Node.js | 20+ |
| Framework | Fastify | 5.x |
| ORM | Prisma | 7.x |
| Base de datos | PostgreSQL | 16 |
| Auth | JWT + bcrypt | - |
| Validación | Zod | 4.x |
| Testing | Vitest + Playwright | - |
| Containers | Podman | - |
| VCS | Jujutsu (jj) | - |

## Arquitectura

```
src/
├── domain/              # Entidades, value objects, errores
├── application/         # Casos de uso y DTOs
├── infrastructure/      # Config, logging, DB, auth
├── adapters/            # HTTP controllers y routes
└── shared/              # Tipos y utilidades
```

**Patrón**: Hexagonal (Puertos y Adaptadores)

## Validación de Entrada (decisión arquitectónica)

La validación de entrada es responsabilidad **única de Zod** (DTOs en
`src/application/dto/*.dto.ts`). Los handlers hacen `XSchema.safeParse(request.query|body|params)`
y responden con `VALIDATION_ERROR` (mensaje en español).

Los schemas `querystring` / `body` / `params` de Fastify en los archivos
`src/adapters/http/routes/*.routes.ts` fueron **eliminados** a propósito: tener
dos fuentes de verdad (Fastify + Zod) provocaba divergencia silenciosa — p.ej.
el `limit` del route decía `1000` pero Zod lo capaba en `100`, rechazando
silenciosamente al frontend. Mantener ambos es un antipatrón.

**Excepción**: rutas donde el handler NO usa Zod (valida manualmente) conservan
su schema de Fastify como única validación:
- `GET /api/v1/productos/search` (validación manual `if q.length < 3`)
- `POST /api/v1/auth/unlock/:userId` (regex manual de UUID)

## Frontend — Terminal POS

El cliente (`client/`) es una SPA Vite + React con shadcn/ui y theming dark/light.

Características de la Terminal de Venta (`client/src/pages/VentasPage.tsx`):
- Pestañas por rubro + pestaña "Todos"; grilla de `ProductCard` con stock y
  última cantidad vendida.
- Ordenamiento por fecha de última venta (desc) vía `/ventas/ultimas-ventas`;
  productos nunca vendidos al final (orden alfabético).
- Al agregar un producto al carro, la cantidad inicial sugerida es la **última
  cantidad vendida**. Si el stock disponible es menor, se carga el stock
  disponible y se muestra un aviso (no se bloquea la carga).
- Cantidades de carro en **coma flotante** (`step="0.01"`) para venta a granel.
- Al confirmar la venta, la grilla y el stock se **refrescan automáticamente**
  (sin recargar la página).
- Historial y Resumen del Día se re-fetchean al cambiar de pestaña.

### Usuarios por Defecto (Frontend)
- Login en `/` con `nik_usuario` / `password`.
- Tema claro/oscuro con el botón de la barra superior.

## Prerequisitos

- Node.js 20+
- Podman y podman-compose
- Jujutsu (jj)

## Instalación Rápida

```bash
# 1. Clonar
jj git clone <repo-url> punto-venta
cd punto-venta

# 2. Configurar entorno
cp .env.example .env

# 3. Iniciar servicios
./scripts/dev.sh up

# 4. Ejecutar migraciones
./scripts/dev.sh migrate

# 5. Seed datos iniciales
./scripts/dev.sh seed
```

## Usuarios por Defecto

| Nik | Contraseña | Rol |
|-----|------------|-----|
| user | password | admin |

## Endpoints Principales

### Autenticación
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/refresh` - Refrescar token
- `POST /api/v1/auth/logout` - Cerrar sesión

### Productos
- `GET /api/v1/productos` - Listar (paginado, filtros)
- `POST /api/v1/productos` - Crear
- `PUT /api/v1/productos/:id` - Actualizar
- `DELETE /api/v1/productos/:id` - Eliminar

### Proveedores
- `GET /api/v1/proveedores` - Listar
- `POST /api/v1/proveedores` - Crear
- `PUT /api/v1/proveedores/:id` - Actualizar
- `DELETE /api/v1/proveedores/:id` - Eliminar

### Rubros
- `GET /api/v1/rubros` - Listar
- `POST /api/v1/rubros` - Crear
- `PUT /api/v1/rubros/:id` - Actualizar
- `DELETE /api/v1/rubros/:id` - Eliminar

### Stock
- `GET /api/v1/stock` - Inventario con alertas
- `POST /api/v1/stock/ingreso` - Ingreso de productos
- `PUT /api/v1/stock/:id` - Editar producto

### Ventas
- `GET /api/v1/ventas` - Historial
- `POST /api/v1/ventas` - Crear venta (transacción atómica)
- `GET /api/v1/ventas/resumen/dia` - Resumen del día
- `GET /api/v1/ventas/ultimas-ventas` - Última fecha y cantidad vendida por producto (usa `DISTINCT ON` en PostgreSQL). Alimenta el ordenamiento y la cantidad sugerida del POS.

### Usuarios (solo admin)
- `GET /api/v1/usuarios` - Listar
- `POST /api/v1/usuarios` - Crear
- `PUT /api/v1/usuarios/:id` - Actualizar
- `DELETE /api/v1/usuarios/:id` - Desactivar

### Health Checks
- `GET /health` - Liveness probe
- `GET /ready` - Readiness probe
- `GET /metrics` - Métricas de performance

## Documentación API

En desarrollo: http://localhost:3001/docs (Swagger/OpenAPI 3.0)

## Comandos de Desarrollo

```bash
./scripts/dev.sh up         # Iniciar servicios
./scripts/dev.sh logs       # Seguir logs
./scripts/dev.sh migrate    # Ejecutar migraciones
./scripts/dev.sh seed       # Seed datos iniciales
./scripts/dev.sh test       # Tests unitarios
./scripts/dev.sh test:e2e   # Tests E2E
./scripts/dev.sh stop       # Detener servicios
./scripts/dev.sh clean      # Detener y eliminar volúmenes
```

## Testing

```bash
# Backend (Vitest)
cd api && bun test

# Frontend (Vitest)
cd client && bun test

# E2E (Playwright)
cd client && bun run test:e2e
```

## Producción

```bash
# Deploy completo
./scripts/deploy.sh

# O manualmente
podman compose -f podman-compose.prod.yml up -d --build
```

## Seguridad

- Contraseñas hasheadas con bcrypt (salt rounds 12)
- JWT access tokens (15 min) + refresh tokens (7 días, httpOnly cookie)
- Rate limiting: 10 intentos por IP por hora
- Bloqueo de cuenta después de 3 intentos fallidos
- Containers corren como non-root
- Secrets con Podman secrets (nunca hardcodeados)

## Monitoreo

- Health checks cada 30s
- Request logging estructurado (pino)
- Métricas: uptime, request count, error rate, avg response time
- Log rotation en producción

## Licencia

ISC
