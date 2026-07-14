// src/domain/entities/usuario.ts
// Usuario entity
export interface Usuario {
  id: string;
  nombre_usuario: string;
  nik_usuario: string;
  password_hash: string;
  email: string;
  telefono: string | null;
  rol: 'admin' | 'gerente' | 'despachador';
  activo: boolean;
  intentos_fallidos: number;
  bloqueado_hasta: Date | null;
  created_at: Date;
  updated_at: Date | null;
}

// Safe user type (without password)
export type UsuarioSafe = Omit<Usuario, 'password_hash'>;

// User with minimal info for JWT
export type UsuarioJWT = Pick<Usuario, 'id' | 'nik_usuario' | 'rol'>;
