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

/** Una fila aplanada de venta del cierre (una por línea de producto) */
export interface VentaCierreFila {
  id_venta: string;
  vendedor: string;
  producto: string;
  cantidad: number;
  monto: number;
}

/** Respuesta del endpoint GET /cierres/:id/ventas */
export interface VentaCierreRespuesta {
  rows: VentaCierreFila[];
  total_monto: number;
  total_filas: number;
}

/** Producto más vendido (frecuencia de venta: nº de ventas distintas que lo incluyen) */
export interface ProductoMasVendido {
  producto_id: string;
  veces_vendido: number;
  monto_total: number;
}
