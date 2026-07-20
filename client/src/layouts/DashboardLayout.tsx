import { Link, Outlet, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/AuthContext';
import {
  Package,
  Truck,
  Tags,
  Users,
  Warehouse,
  ShoppingCart,
  LogOut,
  Menu,
  X,
  Store,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useState } from 'react';

const navItems = [
  { href: '/ventas', label: 'Ventas', icon: ShoppingCart },
  { href: '/productos', label: 'Productos', icon: Package },
  { href: '/proveedores', label: 'Proveedores', icon: Truck },
  { href: '/rubros', label: 'Rubros', icon: Tags },
  { href: '/usuarios', label: 'Usuarios', icon: Users },
  { href: '/stock', label: 'Stock', icon: Warehouse },
  { href: '/administracion', label: 'Administración', icon: ShieldCheck },
];

// Sections visible per role. Despachador only sees Stock + Ventas (POS).
const ALLOWED_SECTIONS_BY_ROLE: Record<string, string[]> = {
  despachador: ['/stock', '/ventas'],
};

// Sections only the admin role may see. Non-admins never see these.
const ADMIN_ONLY_SECTIONS = ['/usuarios'];

export function DashboardLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const allowed = ALLOWED_SECTIONS_BY_ROLE[user?.rol ?? ''];
  const visibleNavItems = (allowed
    ? navItems.filter((item) => allowed.includes(item.href))
    : navItems
  ).filter((item) => user?.rol === 'admin' || !ADMIN_ONLY_SECTIONS.includes(item.href));

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-200 lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-6">
          <Store className="h-6 w-6 text-sidebar-primary" />
          <span className="font-bold text-sidebar-foreground">Punto de Venta</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 p-3">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">
                {user?.nik_usuario?.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{user?.nik_usuario}</p>
              <p className="text-xs text-sidebar-foreground/50 truncate">{user?.rol}</p>
            </div>
            <ThemeToggle className="h-8 w-8 text-sidebar-foreground" />
            <Button variant="ghost" size="icon" onClick={logout} className="text-sidebar-foreground/50 hover:text-sidebar-foreground">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar (mobile) */}
        <header className="flex h-14 items-center gap-4 border-b bg-background px-4 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <Store className="h-5 w-5 text-primary" />
          <span className="font-semibold">Punto de Venta</span>
          <div className="ml-auto">
            <ThemeToggle className="h-8 w-8" />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
