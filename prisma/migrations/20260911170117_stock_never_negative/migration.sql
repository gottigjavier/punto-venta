-- Defense-in-depth: the database physically refuses negative lot stock.
-- Even if application-level locking (SELECT ... FOR UPDATE) regresses or a
-- future code path bypasses validation, a Lote can never go below zero.
-- The graceful STOCK_INSUFFICIENT path is preserved (handled above by
-- createVenta); this constraint only fires on a genuine logic bug.
ALTER TABLE "Lote"
  ADD CONSTRAINT "Lote_cantidad_disponible_non_negative"
  CHECK ("cantidad_disponible" >= 0);
