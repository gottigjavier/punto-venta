// src/domain/entities/rubro.ts
// Rubro entity

export interface Rubro {
  id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  created_at: Date;
  updated_at: Date | null;
}

// Rubro with product count
export interface RubroWithCount extends Rubro {
  _count?: {
    productos: number;
  };
}
