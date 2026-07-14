-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('admin', 'gerente', 'despachador');

-- CreateEnum
CREATE TYPE "UnidadMedida" AS ENUM ('unidad', 'kg', 'g', 'l', 'ml');

-- CreateEnum
CREATE TYPE "EstadoVenta" AS ENUM ('pendiente', 'completada', 'cancelada');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nombre_usuario" VARCHAR(100) NOT NULL,
    "nik_usuario" VARCHAR(50) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "telefono" VARCHAR(20),
    "rol" "Rol" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "intentos_fallidos" INTEGER NOT NULL DEFAULT 0,
    "bloqueado_hasta" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Producto" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nombre" VARCHAR(200) NOT NULL,
    "codigo" VARCHAR(50) NOT NULL,
    "cantidad_disponible" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "precio_compra" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "precio_venta" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "rubro_id" UUID NOT NULL,
    "proveedor_id" UUID NOT NULL,
    "fecha_compra" DATE,
    "fecha_vencimiento" DATE,
    "numero_remesa" VARCHAR(50),
    "unidad_medida" "UnidadMedida" NOT NULL DEFAULT 'unidad',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ,

    CONSTRAINT "Producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proveedor" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "razon_social" VARCHAR(200) NOT NULL,
    "representante" VARCHAR(150),
    "cuit" VARCHAR(13),
    "direccion_postal" TEXT,
    "email" VARCHAR(255),
    "telefonos" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ,

    CONSTRAINT "Proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rubro" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nombre" VARCHAR(100) NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Rubro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venta" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "estado" "EstadoVenta" NOT NULL DEFAULT 'pendiente',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Venta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetalleVenta" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "venta_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "cantidad" DECIMAL(10,3) NOT NULL,
    "precio_unitario" DECIMAL(10,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "DetalleVenta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_nik_usuario_key" ON "Usuario"("nik_usuario");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "Usuario_nik_usuario_idx" ON "Usuario"("nik_usuario");

-- CreateIndex
CREATE INDEX "Usuario_email_idx" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "Usuario_rol_idx" ON "Usuario"("rol");

-- CreateIndex
CREATE INDEX "Producto_nombre_idx" ON "Producto"("nombre");

-- CreateIndex
CREATE INDEX "Producto_codigo_idx" ON "Producto"("codigo");

-- CreateIndex
CREATE INDEX "Producto_fecha_vencimiento_idx" ON "Producto"("fecha_vencimiento");

-- CreateIndex
CREATE INDEX "Producto_rubro_id_idx" ON "Producto"("rubro_id");

-- CreateIndex
CREATE INDEX "Producto_proveedor_id_idx" ON "Producto"("proveedor_id");

-- CreateIndex
CREATE UNIQUE INDEX "Proveedor_cuit_key" ON "Proveedor"("cuit");

-- CreateIndex
CREATE INDEX "Proveedor_razon_social_idx" ON "Proveedor"("razon_social");

-- CreateIndex
CREATE INDEX "Proveedor_cuit_idx" ON "Proveedor"("cuit");

-- CreateIndex
CREATE UNIQUE INDEX "Rubro_nombre_key" ON "Rubro"("nombre");

-- CreateIndex
CREATE INDEX "Rubro_nombre_idx" ON "Rubro"("nombre");

-- CreateIndex
CREATE INDEX "Venta_usuario_id_idx" ON "Venta"("usuario_id");

-- CreateIndex
CREATE INDEX "Venta_created_at_idx" ON "Venta"("created_at");

-- CreateIndex
CREATE INDEX "Venta_estado_idx" ON "Venta"("estado");

-- CreateIndex
CREATE INDEX "DetalleVenta_venta_id_idx" ON "DetalleVenta"("venta_id");

-- CreateIndex
CREATE INDEX "DetalleVenta_producto_id_idx" ON "DetalleVenta"("producto_id");

-- AddForeignKey
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_rubro_id_fkey" FOREIGN KEY ("rubro_id") REFERENCES "Rubro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleVenta" ADD CONSTRAINT "DetalleVenta_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "Venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleVenta" ADD CONSTRAINT "DetalleVenta_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
