-- EF4 (reporte 26/09): retirarLotesVencidos y la ventana FEFO barren
-- estado='activo' AND fecha_vencimiento < hoy — el compuesto permite el
-- range scan sobre el índice en vez de barrer todos los lotes por estado.
CREATE INDEX "Lote_estado_fecha_vencimiento_idx" ON "Lote"("estado", "fecha_vencimiento");