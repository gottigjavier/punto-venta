// src/domain/entities/producto.ts
// Producto entity

export interface Producto {
  id: string;
  nombre: string;
  codigo: string;
  cantidad_disponible: number;
  cantidad_aviso: number;
  precio_compra: number;
  precio_venta: number;
  rubro_id: string;
  proveedor_id: string;
  fecha_compra: Date | null;
  fecha_vencimiento: Date | null;
  numero_remesa: string | null;
  unidad_medida: 'unidad' | 'kg' | 'g' | 'l' | 'ml';
  created_at: Date;
  updated_at: Date | null;
}

// Product with relations
export interface ProductoWithRelations extends Producto {
  rubro: {
    id: string;
    nombre: string;
  };
  proveedor: {
    id: string;
    razon_social: string;
  };
}

// Product for stock view
export interface ProductoStock extends Producto {
  rubro_nombre: string;
  proveedor_razon_social: string;
  estado_vencimiento: 'vencido' | 'por_vencer' | 'ok';
  stock_bajo: boolean;
}

// Product list item (without full relations)
export type ProductoListItem = Pick<
  Producto,
  'id' | 'nombre' | 'codigo' | 'cantidad_disponible' | 'precio_venta' | 'unidad_medida'
>;
