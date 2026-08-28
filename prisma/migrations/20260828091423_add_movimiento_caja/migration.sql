-- CreateEnum
CREATE TYPE "TipoMovimiento" AS ENUM ('ingreso', 'egreso');

-- AlterTable
ALTER TABLE "CierreCaja" ADD COLUMN     "egresos_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "ingresos_total" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "MovimientoCaja" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tipo" "TipoMovimiento" NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "descripcion" TEXT,
    "usuario_id" UUID NOT NULL,
    "cierre_caja_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoCaja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MovimientoCaja_cierre_caja_id_idx" ON "MovimientoCaja"("cierre_caja_id");

-- CreateIndex
CREATE INDEX "MovimientoCaja_created_at_idx" ON "MovimientoCaja"("created_at");

-- CreateIndex
CREATE INDEX "MovimientoCaja_usuario_id_idx" ON "MovimientoCaja"("usuario_id");

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_cierre_caja_id_fkey" FOREIGN KEY ("cierre_caja_id") REFERENCES "CierreCaja"("id") ON DELETE SET NULL ON UPDATE CASCADE;
