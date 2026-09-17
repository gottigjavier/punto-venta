// client/src/lib/types.ts
// Tipos canónicos compartidos del cliente (evitan `unknown` y duplicación).
// Espejo de los DTOs del servidor (src/domain/roles.ts, login UsuarioSafe).

export type Rol = "admin" | "gerente" | "despachador";

// Usuario de sesión devuelto por POST /auth/login (sin password_hash).
// Es la referencia canónica que AuthContext y authApi consumen.
export interface UsuarioSafe {
  id: string;
  nik_usuario: string;
  rol: Rol;
  nombre_usuario: string;
}