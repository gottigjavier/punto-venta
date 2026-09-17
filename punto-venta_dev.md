# Punto de Venta - Prompt Base de Desarrollo

## 1. Objetivo

Desarrollar una aplicación de punto de venta que permita el manejo de ventas, stock y proveedores de manera simple, completa y efectiva. La aplicación debe ser segura, escalable y mantenible.

---

## 2. Stack Tecnológico

| Capa | Tecnología | Justificación |
|------|------------|---------------|
| Frontend | React + Vite + TypeScript | SPA, dev server rápido, proxy `/api` hacia la API, tipado fuerte |
| Backend | Node.js + Fastify | Alto rendimiento, bajo overhead, plugins |
| Base de datos | PostgreSQL | ACID, robustez, extensiones (pg_trgm para búsquedas) |
| ORM | Prisma | Type-safe, migraciones, DX excelente |
| Estado (frontend) | Zustand | Ligero, sin boilerplate, TypeScript-first |
| UI | Tailwind CSS + shadcn/ui | Utilidades, componentes accesibles, customizables |
| Autenticación | JWT + bcrypt | Tokens stateless, hashing seguro |
| Contenedores | Podman | Rootless, daemonless, compatible con Docker |
| Control de versiones | Jujutsu (jj) | Ops log, sin staging area, conflictos no bloqueantes |

---

## 3. Arquitectura

### 3.1 Patrón: Hexagonal (Puertos y Adaptadores)

```
src/
├── domain/              # Entidades, valores objeto, errores de dominio
│   ├── entities/
│   ├── value-objects/
│   └── errors/
├── application/         # Casos de uso
│   ├── use-cases/
│   └── dto/
├── infrastructure/      # Adaptadores externos
│   ├── database/
│   │   ├── prisma/
│   │   └── repositories/
│   ├── auth/
│   ├── config/
│   ├── logging/
│   └── swagger/
├── adapters/            # Adaptadores de entrada
│   ├── http/
│   │   ├── routes/
│   │   ├── middleware/
│   │   ├── controllers/
│   │   └── utils/
└── shared/              # Utilidades compartidas
    ├── types/
    └── utils/
```

### 3.2 Principios

- **Separación de capas**: El dominio no depende de infraestructura.
- **Inyección de dependencias**: Repositorios y servicios se inyectan, no se instancian directamente.
- **Functional errors**: Usar `Result<T, E>` o `neverthrow` en vez de try/catch indiscriminado.

---

## 4. Modelo de Datos

### 4.1 Relaciones

```
Proveedor ──1:N──> Producto
Rubro ──1:N──> Producto
Producto ──N:M──> Venta (a través de DetalleVenta)
Usuario ──1:N──> Venta
```

### 4.2 Tablas

#### Usuarios
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PK, default gen_random_uuid() |
| nombre_usuario | VARCHAR(100) | NOT NULL |
| nik_usuario | VARCHAR(50) | UNIQUE, NOT NULL |
| password_hash | VARCHAR(255) | NOT NULL |
| email | VARCHAR(255) | UNIQUE, FORMATO VÁLIDO |
| telefono | VARCHAR(20) | |
| rol | ENUM('admin', 'gerente', 'despachador') | NOT NULL |
| activo | BOOLEAN | DEFAULT true |
| intentos_fallidos | INTEGER | DEFAULT 0 |
| bloqueado_hasta | TIMESTAMP | NULL |
| created_at | TIMESTAMP | DEFAULT NOW() |
| updated_at | TIMESTAMP | |

#### Productos
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| nombre | VARCHAR(200) | NOT NULL |
| codigo | VARCHAR(50) | NOT NULL |
| cantidad_disponible | DECIMAL(10,3) | CHECK (>= 0) |
| precio_compra | DECIMAL(10,2) | CHECK (>= 0) |
| precio_venta | DECIMAL(10,2) | CHECK (>= 0) |
| rubro_id | UUID | FK -> Rubros |
| proveedor_id | UUID | FK -> Proveedores |
| fecha_compra | DATE | |
| fecha_vencimiento | DATE | |
| numero_lote | VARCHAR(50) | |
| unidad_medida | ENUM('unidad', 'kg', 'g', 'l', 'ml') | DEFAULT 'unidad' |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Índices**: nombre, codigo, fecha_vencimiento, proveedor_id, rubro_id

#### Proveedores
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| razon_social | VARCHAR(200) | NOT NULL |
| representante | VARCHAR(150) | |
| cuit | VARCHAR(13) | UNIQUE |
| direccion_postal | TEXT | |
| email | VARCHAR(255) | |
| telefonos | JSONB | ARRAY de strings |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

#### Rubros
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| nombre | VARCHAR(100) | UNIQUE, NOT NULL |
| descripcion | TEXT | |
| activo | BOOLEAN | DEFAULT true |

#### Ventas
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| usuario_id | UUID | FK -> Usuarios |
| total | DECIMAL(12,2) | NOT NULL |
| estado | ENUM('pendiente', 'completada', 'cancelada') | |
| created_at | TIMESTAMP | |

#### DetalleVenta
| Campo | Tipo | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| venta_id | UUID | FK -> Ventas |
| producto_id | UUID | FK -> Productos |
| cantidad | DECIMAL(10,3) | CHECK (> 0) |
| precio_unitario | DECIMAL(10,2) | CHECK (>= 0) |
| subtotal | DECIMAL(12,2) | GENERATED ALWAYS AS (cantidad * precio_unitario) |

---

## 5. Autenticación y Autorización

### 5.1 Seguridad

- **Contraseñas**: mínimo 8 caracteres, al menos 1 mayúscula, 1 número, 1 carácter especial.
- **Almacenamiento**: bcrypt con salt rounds 12.
- **Tokens**:
  - Access token: JWT, expiración 15 minutos.
  - Refresh token: httpOnly cookie, expiración 7 días, rotación obligatoria.
- **Rate limiting**: global por IP (`RATE_LIMIT_MAX_REQUESTS` × 10 por `RATE_LIMIT_WINDOW_MS`); activo por defecto en production/staging, desactivado en development/test salvo `RATE_LIMIT_ENABLED=true|false`. `/login` tiene límite más estricto: `LOGIN_RATE_LIMIT_MAX=5` por `LOGIN_RATE_LIMIT_WINDOW_MS=60s` por IP.
- **HTTPS**: obligatorio en producción.

### 5.2 Roles y Permisos

| Rol | Productos | Proveedor | Ventas | Stock | Usuarios | Config |
|-----|-----------|-----------|--------|-------|----------|--------|
| Admin | CRUD | CRUD | CRUD | CRUD | CRUD | CRUD |
| Gerente | CRUD | CRUD | CRUD | CRUD | - | - |
| Despachador | R | - | CRU | R | - | - |

*R=Read, C=Create, U=Update, D=Delete*

### 5.3 Endpoints de Auth

```
POST   /api/v1/auth/login          # Login (público)
POST   /api/v1/auth/refresh        # Refrescar token (público, cookie)
POST   /api/v1/auth/logout         # Cerrar sesión
POST   /api/v1/auth/unlock/:userId # Desbloquear usuario (solo admin)
```

### 5.4 Bloqueo de Cuentas

```typescript
// Después de 3 intentos fallidos
if (usuario.intentos_fallidos >= 3) {
  usuario.bloqueado_hasta = new Date(Date.now() + 30 * 60 * 1000); // 30 min
  await repository.save(usuario);
  throw new AccountLockedError();
}
```

---

## 6. Interfaz de Usuario

### 6.1 Directrices Generales

- **Responsive**: Mobile-first. Breakpoints: sm(640), md(768), lg(1024), xl(1280).
- **Accesibilidad**: WCAG AA. Labels explícitos, contraste 4.5:1, navegación por teclado.
- **Estados UI**:
  - Loading: Skeleton loaders (no spinners genéricos).
  - Empty: Mensajes descriptivos ("No hay productos en esta categoría").
  - Error: Toast notifications con opción de retry.
  - Success: Feedback visual breve (checkmark, color).

### 6.2 Layout

```
┌─────────────────────────────────────────────────┐
│  Header (logo, búsqueda global, usuario, logout) │
├──────────┬──────────────────────────────────────┤
│          │                                      │
│ Sidebar  │         Contenido Principal          │
│ (menú)   │                                      │
│          │                                      │
│          │                                      │
└──────────┴──────────────────────────────────────┘
```

- **Sidebar**: Colapsable en móvil (hamburger menu).
- **Rutas principales**:
  - `/dashboard` - Resumen del día
  - `/ventas` - Despacho de productos
  - `/stock` - Gestión de inventario
  - `/proveedores` - Gestión de proveedores
  - `/usuarios` - Solo admin
  - `/config` - Configuración general

### 6.3 Módulo de Despacho (Ventas)

#### Layout de la vista
```
┌─────────────────────────────────────────────────────┐
│ [Rubro 1] [Rubro 2] [Rubro 3] ...    🔍 Buscar    │
├─────────────────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│ │Producto │ │Producto │ │Producto │ │Producto │   │
│ │  $150   │ │  $200   │ │  $80    │ │  $320   │   │
│ │  [3 u]  │ │  [1 u]  │ │  [5 u]  │ │  [2 u]  │   │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘   │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐               │
│ │Producto │ │Producto │ │Producto │               │
│ └─────────┘ └─────────┘ └─────────┘               │
├─────────────────────────────┬───────────────────────┤
│                             │ 🛒 Carrito            │
│                             │ ───────────────────── │
│                             │ ☐ Pan x3      $450   │
│                             │ ☐ Leche x2    $300   │
│                             │ ☑ Café x1     $280   │
│                             │ ───────────────────── │
│                             │ Total: $750           │
│                             │                       │
│                             │ [✅ Confirmar]        │
│                             │ [❌ Cancelar]         │
└─────────────────────────────┴───────────────────────┘
```

#### Comportamiento

1. **Selección de producto**: Click en widget abre modal/panel con:
   - Nombre del producto
   - Precio unitario (editable)
   - Cantidad (input numérico, preseteable)
   - Subtotal calculado en tiempo real
   - Botones: Agregar / Cancelar

2. **Carrito lateral**:
   - Aparece al agregar primer producto.
   - Cada ítem tiene checkbox para excluir del total.
   - Solo productos sin checkbox suman al total.
   - Botones "Confirmar" y "Cancelar" al fondo.

3. **Confirmación de venta**:
   - Transacción atómica:
     ```sql
     BEGIN;
     INSERT INTO ventas (...) RETURNING id;
     INSERT INTO detalle_venta (...) VALUES (...);
     UPDATE productos SET cantidad_disponible = cantidad_disponible - ? WHERE id = ?;
     COMMIT;
     ```
   - Si falla alguna parte, todo se revierte.

4. **Cancelación**:
   - Limpia carrito.
   - Reset estado de la vista.
   - NoERSISTE nada en BD.

### 6.4 Módulo de Stock

#### Layout de la vista
```
┌─────────────────────────────────────────────────────────┐
│ [Inventario] [Ingreso] [Edición]     🔍 Buscar         │
├─────────────────────────────────────────────────────────┤
│ Vencimiento en: [30 días ▼]                             │
├─────────────────────────────────────────────────────────┤
│ Nombre        │ Código    │ Stock │ Precio │ Vence      │
│───────────────┼───────────┼───────┼────────│────────────│
│ Pan integral  │ PAN-001   │ 45    │ $250   │ 2024-03-15 │
│ Leche         │ LEC-002   │ 120   │ $150   │ 2024-02-20 │ ← Naranja
│ Yogur         │ YOG-003   │ 0     │ $80    │ 2024-01-10 │ ← Rojo (vencido)
│ Café molido   │ CAF-004   │ 85    │ $320   │ 2024-06-01 │
└─────────────────────────────────────────────────────────┘
```

#### Comportamiento

1. **Tabla de inventario**:
   - Ordenable por cualquier columna (click en header).
   - Búsqueda por nombre o código (debounce 300ms).
   - Colores:
     - Rojo: producto vencido.
     - Naranja: vence en < X días (configurable).
     - Verde: stock bajo (< 10 unidades, configurable).

2. **Pestaña de Ingreso**:
   - Campos: nombre, código, precio venta, rubro, proveedor, unidad, cantidad aviso (el stock se carga por lote en el módulo Stock).
   - **Autocompletado**: Al ingresar 3+ caracteres en nombre o código, muestra dropdown con coincidencias.
   - Al seleccionar coincidencia, rellena todos los campos (editables).
   - **Validación**: No permite guardar si TODOS los campos coinciden con producto existente.
   - Debe diferir en al menos 1 campo para crear nuevo registro.

3. **Pestaña de Edición**:
   - Búsqueda de producto existente.
   - Formulario pre-llenado con datos actuales.
   - Campos editables.
   - Botones: Guardar / Cancelar.

---

## 7. API REST

### 7.1 Estructura

```
/api/v1/
├── auth/
│   ├── login
│   ├── refresh
│   ├── logout
│   └── unlock/:userId
├── usuarios/
│   ├── GET /          (admin)
│   ├── GET /:id
│   ├── POST /         (admin)
│   ├── PUT /:id       (admin)
│   └── DELETE /:id    (admin)
├── productos/
│   ├── GET /
│   ├── GET /:id
│   ├── POST /
│   ├── PUT /:id
│   └── DELETE /:id
├── proveedores/
│   ├── GET /
│   ├── GET /:id
│   ├── POST /
│   ├── PUT /:id
│   └── DELETE /:id
├── rubros/
│   ├── GET /
│   ├── POST /
│   ├── PUT /:id
│   └── DELETE /:id
├── ventas/
│   ├── GET /            (histórico)
│   ├── GET /:id
│   ├── POST /           (confirmar venta)
│   └── GET /resumen/dia (totales del día)
└── stock/
    ├── GET /
    ├── POST /            (ingreso)
    └── PUT /:id          (editar)
```

### 7.2 Patrones de Respuesta

```typescript
// Éxito
{
  "success": true,
  "data": { ... }
}

// Error
{
  "success": false,
  "error": {
    "code": "STOCK_INSUFFICIENT",
    "message": "Stock insuficiente para producto PAN-001",
    "details": { "disponible": 5, "solicitado": 10 }
  }
}

// Paginación
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

### 7.3 Filtros y Ordenamiento

```
GET /api/v1/productos?search=pan&rubro=rubro-id&sort=precio_venta&order=asc&page=1&limit=20
```

---

## 8. Requisitos No Funcionales

### 8.1 Performance

| Métrica | Objetivo |
|---------|----------|
| Tiempo carga inicial | < 3 segundos (3G) |
| Respuesta API (p95) | < 200ms |
| Usuarios concurrentes | 50 mínimo |
| Tamaño bundle JS | < 200KB gzipped |

### 8.2 Testing

| Tipo | Cobertura | Herramientas |
|------|-----------|--------------|
| Unit | 80% mínimo | Vitest |
| Integration | Flujos críticos | Vitest (`app.inject`) |
| E2E | Flujos principales | Playwright |

**Flujos críticos a testear**:
1. Login → seleccionar producto → agregar al carrito → confirmar venta → verificar stock.
2. Login → ingreso de producto → verificar en tabla.
3. Login → edición de producto → verificar cambios.
4. Login → intentos fallidos → verificación de bloqueo.

### 8.3 Monitoreo

- **Logging**: JSON estructurado (pino o winston).
- **Métricas**: Tiempo respuesta, errores HTTP, uso de DB.
- **Health checks**:
  ```
  GET /health       → 200 OK (siempre)
  GET /ready        → 200 OK (si DB y servicios OK)
  ```

---

## 9. Operaciones con Podman

### 9.1 Estructura de Contenedores

```
podman-compose.yml
├── db          # PostgreSQL (puerto 5432) — container pv-database
├── migrate     # Prisma migrate deploy (one-shot, termina) — container pv-migrate
├── api         # Fastify (puerto 3001) — container pv-api
└── client      # React + Vite dev server (puerto 5173) — container pv-client
```

### 9.2 Containerfile (Backend)

```dockerfile
# api/Containerfile (producción — multi-stage)
FROM node:20-alpine AS builder

WORKDIR /app

# Install ALL dependencies (including devDependencies for build)
COPY package*.json ./
RUN npm ci

# Copy Prisma schema and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy source code and build TypeScript
COPY src ./src/
COPY tsconfig.json ./
RUN npm run build

# Remove devDependencies after build
RUN npm prune --omit=dev

# ─── Stage 2: Production ─────────────────────
FROM node:20-alpine

# Security: add non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup && \
    apk add --no-cache wget

WORKDIR /app

# Copy only what's needed for runtime
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/package.json ./
COPY --from=builder --chown=appuser:appgroup /app/prisma ./prisma

USER appuser

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["node", "dist/main.js"]
```

> El compose de desarrollo usa `api/Containerfile.dev` (la imagen levanta el `dist` compilado y el compose monta `./src` en vivo con `tsx watch src/main.ts` como `command`, ver `podman-compose.yml`).

### 9.3 Containerfile (Frontend)

```dockerfile
# client/Containerfile — Vite dev server dentro de podman (compose service `client`)
FROM node:20-alpine

WORKDIR /app

# Install dependencies (deterministic: npm ci usa el package-lock.json)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source
COPY . .

# El proxy de Vite reenvía /api al servicio `api` de la red del compose.
ENV VITE_PROXY_TARGET=http://api:3001

EXPOSE 5173

# host: true está seteado en vite.config; el dev server corre bound a 0.0.0.0
CMD ["npm", "run", "dev"]
```

> Es la imagen de desarrollo del client (dev server de Vite con hot reload; el navegador solo habla con el contenedor del client y el proxy reenvía `/api` al `api`). El build de producción del client no corre en podman (se despliega aparte, ver `docs/OPERATIONS.md`).

### 9.4 Comandos Útiles

```bash
# Desarrollo
podman compose up -d                                 # db + migrate (one-shot) + api + client (Vite 5173)
podman compose logs -f api
podman compose exec api npx prisma migrate dev       # desarrollar/aplicar migraciones (dev)
podman compose run --rm migrate                      # re-ejecutar el one-shot `migrate deploy`

# Producción
podman compose -f podman-compose.prod.yml up -d --build
podman compose -f podman-compose.prod.yml exec api npx prisma migrate deploy

# Tests
npm run test:run        # unit + integración (Vitest)
npm run test:e2e        # E2E (Playwright — tests/e2e, workers=1, serial)

# Mantenimiento
podman system prune -f
podman volume prune -f

# Secrets (prod compose los resuelve desde el archivo, ver podman-compose.prod.yml)
echo "mi-secreto" > secrets/db_password.txt
```

---

## 10. Control de Versiones con Jujutsu (jj)

### 10.1 Configuración Inicial

```bash
# Inicializar repo
jj git init --colocated

# Configurar autor
jj config set user.name "Tu Nombre"
jj config set user.email "tu@email.com"
```

### 10.2 Flujo de Trabajo

```bash
# Ver historial
jj log
jj log -r 'description(substring:"feat")'  # Buscar por descripción

# Crear nueva feature
jj new -m "feat(auth): implementar login con JWT"

# Trabajar en el código
# ... editar archivos ...
jj diff  # Ver cambios

# Commitear (jj auto-snapshots, pero podés guardar estado)
jj commit -m "feat(auth): agregar endpoint de login"

# Crear rama para fix urgente desde main
jj new main -m "fix(stock): corregir cálculo de stock negativo"
# ... fixear ...
jj commit

# Rebasear feature sobre main
jj rebase -s feature-branch -o main

# Split un commit grande en varios
jj split -r @- src/auth/login.ts src/auth/middleware.ts -m "feat(auth): agregar middleware"

# Absorber cambios menores en commits anteriores
jj absorb
```

### 10.3 Convenciones de Commits

```
<tipo>(<scope>): <descripción>

Tipos:
- feat:     Nueva funcionalidad
- fix:      Corrección de bug
- refactor: Refactorización sin cambio de comportamiento
- test:     Agregar o corregir tests
- docs:     Documentación
- chore:    Tareas de mantenimiento
- perf:     Mejora de rendimiento
- ci:       Cambios en CI/CD

Scopes:
- auth, stock, ventas, proveedores, ui, api, db
```

### 10.4 Tags y Releases

```bash
# Tag de versión
jj tag set v1.0.0 -r @

# Listar tags
jj tag list
```

---

## 11. Entornos

### 11.1 Variables de Entorno

```bash
# .env.example (referencia; la validación real está en src/infrastructure/config/env.ts)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/punto_venta_dev
JWT_SECRET=change-this-to-a-secure-random-string-min-32-chars
JWT_REFRESH_SECRET=change-this-to-another-secure-random-string-min-32
NODE_ENV=development
API_PORT=3001
FRONTEND_URL=http://localhost:5173     # dev server de Vite (el compose dev la setea así)
TRUST_PROXY_HOPS=0

# Rate limiting (RATE_LIMIT_ENABLED=true|false sobreescribe el default por NODE_ENV)
RATE_LIMIT_ENABLED=
RATE_LIMIT_WINDOW_MS=3600000
RATE_LIMIT_MAX_REQUESTS=10
LOGIN_RATE_LIMIT_MAX=5
LOGIN_RATE_LIMIT_WINDOW_MS=60000

# Account lockout
MAX_LOGIN_ATTEMPTS=3
LOCKOUT_DURATION_MINUTES=30

# Logging / métricas
LOG_LEVEL=info
METRICS_TOKEN=
```

### 11.2 Entornos

| Entorno | Uso | Base datos |
|---------|-----|------------|
| development | Desarrollo local | punto_venta_dev |
| staging | QA y pruebas | punto_venta_staging |
| production | Producción | punto_venta |
| test | Tests (CI/local) | punto_venta_test |

---

## 12. Checklist de Desarrollo

### Fase 1: Fundamentos
- [ ] Configurar proyecto con TypeScript estricto
- [ ] Implementar estructura hexagonal
- [ ] Configurar Prisma con schema completo
- [ ] Implementar autenticación (login, JWT, roles)
- [ ] Configurar Podman y Containerfiles

### Fase 2: Core
- [ ] CRUD de productos
- [ ] CRUD de proveedores
- [ ] CRUD de rubros
- [ ] Gestión de stock con validaciones

### Fase 3: Ventas
- [ ] Interfaz de despacho (carrito, widgets)
- [ ] Lógica de venta con transacciones
- [ ] Resta automática de stock
- [ ] Resumen diario de ventas

### Fase 4: Pulido
- [ ] Testing unitario (80%)
- [ ] Testing E2E (flujos críticos)
- [ ] Optimización de performance
- [ ] Documentación de API (Swagger)

### Fase 5: Operaciones
- [ ] CI/CD con Podman
- [ ] Health checks
- [ ] Logging estructurado
- [ ] Backup automático de DB
