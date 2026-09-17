// Shared domain types for the Ventas feature (POS, historial, resumen y
// movimientos). Extracted from VentasPage.tsx during the QC1 split so the
// feature files (POSView, ProductCard, cardWidth, ...) can share them without
// circular imports.

export interface Rubro {
  id: string;
  nombre: string;
  activo: boolean;
}

export interface ProductSearchResult {
  id: string;
  nombre: string;
  codigo: string;
  stock_actual: number;
  precio_venta: number;
  unidad_medida: string;
  rubro_id?: string;
  rubro?: { id: string; nombre: string };
  proveedor?: { id: string; razon_social: string };
}

export interface UltimaVenta {
  producto_id: string;
  ultima_venta_at: string | null;
  ultima_cantidad: number | null;
}

export interface CartItem {
  producto_id: string;
  nombre: string;
  codigo: string;
  precio_venta: number;
  cantidad: number;
  stock_disponible: number;
  unidad_medida: string;
}

export interface VentaDetalle {
  id: string;
  venta_id: string;
  producto_id: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  producto: { id: string; nombre: string; codigo: string };
}

export interface VentaWithDetails {
  id: string;
  usuario_id: string;
  total: number;
  estado: "pendiente" | "completada" | "cancelada";
  created_at: string;
  usuario: { id: string; nombre_usuario: string; nik_usuario: string };
  detalles_venta: VentaDetalle[];
}

export interface ResumenDia {
  fecha: string;
  total_ventas: number;
  monto_total: number;
  ingresos_total: number;
  egresos_total: number;
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

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Usuario {
  id: string;
  nombre_usuario: string;
}