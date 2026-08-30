-- =============================================================================
-- Split Producto into Producto + Lote (normalización de inventario)
-- ADD-then-DROP con dedupe de (codigo, proveedor_id) y backfill 1 Producto -> 1 Lote
--
-- Orden DENTRO de una única transacción:
--   1. CREATE TYPE "EstadoLote"
--   2. Dedupe (codigo, proveedor_id) previo a la constraint UNIQUE
--   3. Producto.activo
--   4. CREATE TABLE "Lote" (+ FKs + índices)
--   5. DetalleVenta.lote_id (+ FK RESTRICT + índice)
--   6. Backfill 1:1 Producto -> Lote (idempotente: tabla Lote vacía)
--   7. UNIQUE (codigo, proveedor_id) en Producto
--   8. DROP columnas/índice legacy de Producto
-- =============================================================================

-- 1) Enum de estado de lote
CREATE TYPE "EstadoLote" AS ENUM ('activo', 'agotado', 'vencido', 'descartado');

-- 2) Dedupe (codigo, proveedor_id) antes de la constraint UNIQUE.
--    Canónico = el de MÁS DetalleVenta; desempate created_at ASC.
--    No-canónicos SIN ventas -> DELETE (físico, no generan Lote).
--    No-canónicos CON ventas -> renombra codigo = codigo || '-DUP-' || n (n=1,2.. por grupo).
--    (No-op si no existen duplicados.)
WITH ranked AS (
    SELECT
        p.id,
        p.codigo,
        p.proveedor_id,
        ROW_NUMBER() OVER (
            PARTITION BY p.codigo, p.proveedor_id
            ORDER BY COUNT(d.id) DESC, p.created_at ASC
        ) AS rn
    FROM "Producto" p
    LEFT JOIN "DetalleVenta" d ON d.producto_id = p.id
    GROUP BY p.id, p.codigo, p.proveedor_id, p.created_at
),
dup_groups AS (
    SELECT codigo, proveedor_id
    FROM "Producto"
    GROUP BY codigo, proveedor_id
    HAVING COUNT(*) > 1
)
-- 2a) ELIMINAR no-canónicos SIN ventas (rn > 1 y sin DetalleVenta)
DELETE FROM "Producto" p
WHERE p.id IN (
    SELECT r.id
    FROM ranked r
    JOIN dup_groups g ON g.codigo = r.codigo AND g.proveedor_id = r.proveedor_id
    WHERE r.rn > 1
      AND NOT EXISTS (SELECT 1 FROM "DetalleVenta" d WHERE d.producto_id = r.id)
);

-- 2b) RENOMBRAR no-canónicos CON ventas (rn > 1 con DetalleVenta) -> codigo-DUP-{n}
WITH ranked AS (
    SELECT
        p.id,
        p.codigo,
        p.proveedor_id,
        ROW_NUMBER() OVER (
            PARTITION BY p.codigo, p.proveedor_id
            ORDER BY COUNT(d.id) DESC, p.created_at ASC
        ) AS rn,
        ROW_NUMBER() OVER (
            PARTITION BY p.codigo, p.proveedor_id
            ORDER BY COUNT(d.id) DESC, p.created_at ASC
        ) AS seq
    FROM "Producto" p
    LEFT JOIN "DetalleVenta" d ON d.producto_id = p.id
    GROUP BY p.id, p.codigo, p.proveedor_id, p.created_at
),
dup_groups AS (
    SELECT codigo, proveedor_id
    FROM "Producto"
    GROUP BY codigo, proveedor_id
    HAVING COUNT(*) > 1
)
UPDATE "Producto" p
SET codigo = r.codigo || '-DUP-' || (r.seq - 1)
FROM ranked r,
     dup_groups g
WHERE p.id = r.id
  AND r.rn > 1
  AND g.codigo = r.codigo AND g.proveedor_id = r.proveedor_id
  AND EXISTS (SELECT 1 FROM "DetalleVenta" d WHERE d.producto_id = r.id);

-- 3) Producto.activo (soft delete)
ALTER TABLE "Producto" ADD COLUMN "activo" BOOLEAN NOT NULL DEFAULT true;

-- 4) Tabla Lote (stock/compra/vencimiento/estado ahora viven acá)
CREATE TABLE "Lote" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "producto_id" UUID NOT NULL,
    "numero_lote" VARCHAR(50),
    "cantidad_disponible" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "fecha_compra" DATE,
    "fecha_vencimiento" DATE,
    "precio_compra" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "estado" "EstadoLote" NOT NULL DEFAULT 'activo',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Lote_producto_id_estado_idx" ON "Lote"("producto_id", "estado");
CREATE INDEX "Lote_producto_id_fecha_vencimiento_idx" ON "Lote"("producto_id", "fecha_vencimiento");
CREATE INDEX "Lote_estado_idx" ON "Lote"("estado");

ALTER TABLE "Lote" ADD CONSTRAINT "Lote_producto_id_fkey"
    FOREIGN KEY ("producto_id") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5) Trazabilidad de ventas por lote (históricos quedan con lote_id NULL)
ALTER TABLE "DetalleVenta" ADD COLUMN "lote_id" UUID;

ALTER TABLE "DetalleVenta" ADD CONSTRAINT "DetalleVenta_lote_id_fkey"
    FOREIGN KEY ("lote_id") REFERENCES "Lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "DetalleVenta_lote_id_idx" ON "DetalleVenta"("lote_id");

-- 6) Backfill 1 Producto -> 1 Lote.
--    numero_lote = numero_remesa (o 'SIN-LOTE' si NULL); estado = 'activo' si cantidad > 0, sino 'agotado'.
--    Idempotente: solo inserta si la tabla Lote está vacía (evita re-backfill en re-ejecución).
INSERT INTO "Lote" ("producto_id", "numero_lote", "cantidad_disponible", "fecha_compra", "fecha_vencimiento", "precio_compra", "estado")
SELECT
    p."id",
    COALESCE(p."numero_remesa", 'SIN-LOTE'),
    p."cantidad_disponible",
    p."fecha_compra",
    p."fecha_vencimiento",
    p."precio_compra",
    CASE WHEN p."cantidad_disponible" > 0 THEN 'activo' ELSE 'agotado' END::"EstadoLote"
FROM "Producto" p
WHERE NOT EXISTS (SELECT 1 FROM "Lote" l);

-- 7) Unicidad compuesta de código por proveedor (delegada a la DB)
CREATE UNIQUE INDEX "Producto_codigo_proveedor_id_key" ON "Producto"("codigo", "proveedor_id");

-- 8) DROP de columnas/índice legacy de Producto (la data ya fue migrada a Lote)
ALTER TABLE "Producto" DROP COLUMN "cantidad_disponible",
DROP COLUMN "fecha_compra",
DROP COLUMN "fecha_vencimiento",
DROP COLUMN "numero_remesa",
DROP COLUMN "precio_compra";

DROP INDEX IF EXISTS "Producto_fecha_vencimiento_idx";
