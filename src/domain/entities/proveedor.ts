// src/domain/entities/proveedor.ts
// Proveedor entity

export interface Proveedor {
  id: string;
  razon_social: string;
  representante: string | null;
  cuit: string | null;
  direccion_postal: string | null;
  email: string | null;
  telefonos: string[] | null;
  created_at: Date;
  updated_at: Date | null;
}

// Supplier list item
export type ProveedorListItem = Pick<Proveedor, 'id' | 'razon_social' | 'cuit' | 'email'>;

// Supplier with product count
export interface ProveedorWithCount extends ProveedorListItem {
  _count?: {
    productos: number;
  };
}
