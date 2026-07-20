import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/features/auth/AuthContext';
import { ThemeProvider } from '@/components/ThemeProvider';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { LoginPage } from '@/pages/LoginPage';
import { ProductsPage } from '@/pages/ProductsPage';
import { ProveedoresPage } from '@/pages/ProveedoresPage';
import { RubrosPage } from '@/pages/RubrosPage';
import { UsuariosPage } from '@/pages/UsuariosPage';
import { StockPage } from '@/pages/StockPage';
import { VentasPage } from '@/pages/VentasPage';
import { AdministracionPage } from '@/pages/AdministracionPage';
import { AdministracionDetallePage } from '@/pages/AdministracionDetallePage';
import { type ReactNode } from 'react';

// Routes a which each role is allowed to navigate. Anything else is redirected.
// Despachador: only Stock + Ventas (POS). The POS still reads productos/rubros
// via API (backend permits those GETs for despachador), but the section nav is
// restricted. Admin/gerente: everything.
const ROLE_ALLOWED_PATHS: Record<string, string[]> = {
  despachador: ['/ventas', '/stock'],
};

// Paths only the admin role may reach. Non-admins are redirected to their home.
const ADMIN_ONLY_PATHS = ['/usuarios'];

function homeForRole(rol?: string): string {
  return '/ventas';
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading, user } = useAuth();
  const location = useLocation();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Cargando...</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  const allowed = ROLE_ALLOWED_PATHS[user?.rol ?? ''];
  if (allowed && !allowed.some((p) => location.pathname === p || location.pathname.startsWith(p + '/'))) {
    return <Navigate to={homeForRole(user?.rol)} replace />;
  }

  const isAdminOnlyPath = ADMIN_ONLY_PATHS.some(
    (p) => location.pathname === p || location.pathname.startsWith(p + '/'),
  );
  if (isAdminOnlyPath && user?.rol !== 'admin') {
    return <Navigate to={homeForRole(user?.rol)} replace />;
  }
  return <>{children}</>;
}

function PublicRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading, user } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Cargando...</div>;
  if (isAuthenticated) return <Navigate to={homeForRole(user?.rol)} replace />;
  return <>{children}</>;
}

function NavigateToHome() {
  const { user } = useAuth();
  return <Navigate to={homeForRole(user?.rol)} replace />;
}

export function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
      <AuthProvider>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicRoute>
                <LoginPage />
              </PublicRoute>
            }
          />
          <Route
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/productos" element={<ProductsPage />} />
            <Route path="/proveedores" element={<ProveedoresPage />} />
            <Route path="/rubros" element={<RubrosPage />} />
            <Route path="/usuarios" element={<UsuariosPage />} />
            <Route path="/stock" element={<StockPage />} />
            <Route path="/ventas" element={<VentasPage />} />
            <Route path="/administracion" element={<AdministracionPage />} />
            <Route path="/administracion/:id" element={<AdministracionDetallePage />} />
          </Route>
          <Route path="*" element={<NavigateToHome />} />
        </Routes>
      </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
