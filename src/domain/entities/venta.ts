// src/domain/entities/venta.ts
// Venta entity

export interface Venta {
  id: string;
  usuario_id: string;
  total: number;
  estado: 'pendiente' | 'completada' | 'cancelada';
  created_at: Date;
}

export interface DetalleVenta {
  id: string;
  venta_id: string;
  producto_id: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

// Venta with details and relations
export interface VentaWithDetalles extends Venta {
  usuario: {
    id: string;
    nombre_usuario: string;
    nik_usuario: string;
  };
  detalles_venta: Array<
    DetalleVenta & {
      producto: {
        id: string;
        nombre: string;
        codigo: string;
      };
    }
  >;
}

// Venta list item (compact)
export interface VentaListItem {
  id: string;
  usuario_id: string;
  usuario_nombre: string;
  total: number;
  estado: 'pendiente' | 'completada' | 'cancelada';
  cantidad_items: number;
  created_at: Date;
}

// Resumen diario
export interface ResumenDia {
  fecha: string;
  total_ventas: number;
  monto_total: number;
  productos_vendidos: Array<{
    producto_id: string;
    nombre: string;
    cantidad_total: number;
    monto_total: number;
  }>;
  ventas_por_usuario: Array<{
    usuario_id: string;
    nombre: string;
    cantidad_ventas: number;
    monto_total: number;
  }>;
}
