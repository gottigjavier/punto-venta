-- CreateEnum
CREATE TYPE "EstadoCierre" AS ENUM ('abierto', 'cerrado');

-- AlterTable
ALTER TABLE "Venta" ADD COLUMN     "cierre_caja_id" UUID;

-- CreateTable
CREATE TABLE "CierreCaja" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fecha_apertura" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_cierre" TIMESTAMPTZ,
    "usuario_apertura_id" UUID NOT NULL,
    "usuario_cierre_id" UUID,
    "monto_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cantidad_ventas" INTEGER NOT NULL DEFAULT 0,
    "estado" "EstadoCierre" NOT NULL DEFAULT 'abierto',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CierreCaja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CierreCajaDetalle" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cierre_caja_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "referencia_id" UUID NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "monto_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CierreCajaDetalle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CierreCaja_estado_idx" ON "CierreCaja"("estado");

-- CreateIndex
CREATE INDEX "CierreCaja_fecha_cierre_idx" ON "CierreCaja"("fecha_cierre");

-- CreateIndex
CREATE INDEX "CierreCajaDetalle_cierre_caja_id_idx" ON "CierreCajaDetalle"("cierre_caja_id");

-- CreateIndex
CREATE INDEX "CierreCajaDetalle_tipo_idx" ON "CierreCajaDetalle"("tipo");

-- CreateIndex
CREATE INDEX "Venta_cierre_caja_id_idx" ON "Venta"("cierre_caja_id");

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_cierre_caja_id_fkey" FOREIGN KEY ("cierre_caja_id") REFERENCES "CierreCaja"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CierreCaja" ADD CONSTRAINT "CierreCaja_usuario_apertura_id_fkey" FOREIGN KEY ("usuario_apertura_id") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CierreCaja" ADD CONSTRAINT "CierreCaja_usuario_cierre_id_fkey" FOREIGN KEY ("usuario_cierre_id") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CierreCajaDetalle" ADD CONSTRAINT "CierreCajaDetalle_cierre_caja_id_fkey" FOREIGN KEY ("cierre_caja_id") REFERENCES "CierreCaja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
