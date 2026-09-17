-- CierreCaja.estado: el único insert real es 'cerrado' (CO4); el default
-- 'abierto' era una trampa: un insert que omitiera estado crearía un cierre
-- abierto inexistente. El "período abierto" se modela con cierre_caja_id IS NULL.
ALTER TABLE "CierreCaja" ALTER COLUMN "estado" SET DEFAULT 'cerrado';