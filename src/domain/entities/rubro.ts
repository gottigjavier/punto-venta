// src/domain/entities/rubro.ts
// Rubro entity

export interface Rubro {
  id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}

// Rubro with product count
export interface RubroWithCount extends Rubro {
  _count?: {
    productos: number;
  };
}
