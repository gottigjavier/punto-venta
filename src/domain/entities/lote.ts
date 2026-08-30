// src/domain/entities/lote.ts
// Lote entity — el stock/compra/vencimiento vive en el lote, no en el producto.

export type EstadoLote = 'activo' | 'agotado' | 'vencido' | 'descartado';

export interface Lote {
  id: string;
  producto_id: string;
  numero_lote: string | null;
  cantidad_disponible: number;
  fecha_compra: Date | null;
  fecha_vencimiento: Date | null;
  precio_compra: number;
  estado: EstadoLote;
  created_at: Date;
}

// Lote con relaciones (fila típica del listado de stock)
export interface LoteWithRelations extends Lote {
  producto: {
    id: string;
    nombre: string;
    codigo: string;
    unidad_medida: 'unidad' | 'kg' | 'g' | 'l' | 'ml';
    precio_venta: number;
    cantidad_aviso: number;
  };
  rubro: {
    id: string;
    nombre: string;
  };
  proveedor: {
    id: string;
    razon_social: string;
  };
}
