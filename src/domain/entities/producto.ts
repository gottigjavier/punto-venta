// src/domain/entities/producto.ts
// Producto entity — información general del producto (maestro).
// El stock/compra/vencimiento ya NO viven acá: van en Lote (ver ./lote.ts).
import type { Lote } from './lote.js';

// Unidad de medida (compartida con Lote.producto.unidad_medida)
export type UnidadMedida = 'unidad' | 'kg' | 'g' | 'l' | 'ml';

export interface Producto {
  id: string;
  nombre: string;
  codigo: string;
  cantidad_aviso: number;
  precio_venta: number;
  rubro_id: string;
  proveedor_id: string;
  unidad_medida: UnidadMedida;
  activo: boolean;
  vencimiento_preaviso_dias?: number;
  stock_actual: number; // calculado: SUM de lotes activos NO vencidos
  lotes: Lote[];
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

// Fila de stock (ahora es UNA FILA DE LOTE, no un producto)
export interface ProductoStock extends Lote {
  rubro: {
    id: string;
    nombre: string;
  };
  proveedor: {
    id: string;
    razon_social: string;
  };
  producto: {
    id: string;
    nombre: string;
    codigo: string;
    unidad_medida: UnidadMedida;
    precio_venta: number;
    cantidad_aviso: number;
  };
  estado_vencimiento: 'vencido' | 'por_vencer' | 'ok';
  stock_bajo: boolean;
}

// Product list item (without full relations)
export type ProductoListItem = Pick<
  Producto,
  'id' | 'nombre' | 'codigo' | 'stock_actual' | 'precio_venta' | 'unidad_medida'
>;
