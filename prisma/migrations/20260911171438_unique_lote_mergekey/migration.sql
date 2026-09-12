-- Deduplicates lots on the merge-key (producto_id, numero_lote, fecha_vencimiento).
-- Concurrency risk closed: two concurrent loteIngreso/loteEdit with the same
-- merge-key could both read "no existing lote" and insert duplicate rows. This
-- partial index (only non-NULL numero_lote; NULL never merges by design) makes
-- PostgreSQL itself refuse the duplicate, complementing the FOR UPDATE + P2002
-- retry applied in the use case.
CREATE UNIQUE INDEX "Lote_merge_key_unique"
  ON "Lote" ("producto_id", "numero_lote", "fecha_vencimiento")
  WHERE "numero_lote" IS NOT NULL;
