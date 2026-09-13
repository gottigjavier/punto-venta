import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { authApi, setAccessToken, redirectToLogin } from '@/lib/api-client';
import type { UsuarioSafe } from '@/lib/types';

// Sesión: usa el tipo canónico de cliente (Q5) — duplicaba localmente a UsuarioSafe.
type User = UsuarioSafe;

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (nik_usuario: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

function parseJwt(token: string): User | null {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    const payload = JSON.parse(jsonPayload);
    return {
      id: payload.userId,
      nik_usuario: payload.nik_usuario,
      rol: payload.rol,
      nombre_usuario: payload.nik_usuario,
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restaurar la sesión al cargar la SPA: el access token vive en memoria y no
    // persiste, así que pedimos uno nuevo a /auth/refresh usando la cookie
    // httpOnly del refresh token. Si expiró, quedamos deslogueados (login).
    let active = true;

    (async () => {
      try {
        const { data } = await authApi.refresh();
        const token = data.data.accessToken;
        setAccessToken(token);
        if (active) setUser(parseJwt(token));
      } catch {
        if (active) setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (nik_usuario: string, password: string) => {
    const { data } = await authApi.login(nik_usuario, password);
    const token = data.data.accessToken;
    setAccessToken(token);
    setUser(parseJwt(token));
  }, []);

  const logout = useCallback(async () => {
    // Llamar al servidor para invalidar/borrar la cookie httpOnly del refresh
    // token; si no, un reload restauraría la sesión vía /auth/refresh.
    try {
      await authApi.logout();
    } catch {
      // Si la sesión ya expiró el logout puede fallar; aun así limpiamos estado.
    }
    setAccessToken(null);
    setUser(null);
    redirectToLogin();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
