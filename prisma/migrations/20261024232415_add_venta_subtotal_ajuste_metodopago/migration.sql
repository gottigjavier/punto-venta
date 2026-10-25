-- CreateEnum
CREATE TYPE "MetodoPago" AS ENUM ('EFECTIVO', 'DIGITAL');

-- AlterTable
ALTER TABLE "Venta" ADD COLUMN     "ajuste" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "metodo_pago" "MetodoPago" NOT NULL DEFAULT 'EFECTIVO',
ADD COLUMN     "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Venta_metodo_pago_idx" ON "Venta"("metodo_pago");
