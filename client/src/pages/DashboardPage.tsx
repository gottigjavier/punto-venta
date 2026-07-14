import { useEffect, useState, useCallback } from 'react';
import {
  productosApi,
  proveedoresApi,
  rubrosApi,
  usuariosApi,
  stockApi,
  ventasApi,
  type ApiResponse,
} from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/AuthContext';
import {
  Package,
  Truck,
  Tags,
  Users,
  Warehouse,
  ShoppingCart,
  DollarSign,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

interface DashboardData {
  ventasHoy: number;
  montoTotal: number;
  productos: number;
  proveedores: number;
  rubros: number;
  usuarios: number;
  stockItems: number;
  stockBajo: number;
}

const PLACEHOLDER: DashboardData = {
  ventasHoy: 0,
  montoTotal: 0,
  productos: 0,
  proveedores: 0,
  rubros: 0,
  usuarios: 0,
  stockItems: 0,
  stockBajo: 0,
};

const statCards = [
  { key: 'ventasHoy' as const, label: 'Ventas Hoy', icon: ShoppingCart, color: 'text-green-600', bg: 'bg-green-100', format: 'number' as const },
  { key: 'montoTotal' as const, label: 'Monto Total', icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-100', format: 'currency' as const },
  { key: 'productos' as const, label: 'Productos', icon: Package, color: 'text-blue-600', bg: 'bg-blue-100', format: 'number' as const },
  { key: 'proveedores' as const, label: 'Proveedores', icon: Truck, color: 'text-orange-600', bg: 'bg-orange-100', format: 'number' as const },
  { key: 'rubros' as const, label: 'Rubros', icon: Tags, color: 'text-purple-600', bg: 'bg-purple-100', format: 'number' as const },
  { key: 'usuarios' as const, label: 'Usuarios', icon: Users, color: 'text-cyan-600', bg: 'bg-cyan-100', format: 'number' as const },
  { key: 'stockItems' as const, label: 'Stock Items', icon: Warehouse, color: 'text-amber-600', bg: 'bg-amber-100', format: 'number' as const },
  { key: 'stockBajo' as const, label: 'Stock Bajo', icon: AlertTriangle, color: 'text-rose-600', bg: 'bg-rose-100', format: 'number' as const },
];

function formatValue(value: number, format: 'number' | 'currency'): string {
  if (format === 'currency') {
    return `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return value.toLocaleString('es-AR');
}

export function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData>(PLACEHOLDER);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        resumenRes,
        productosRes,
        proveedoresRes,
        rubrosRes,
        usuariosRes,
        stockRes,
        stockBajoRes,
      ] = await Promise.all([
        ventasApi.resumenDia(),
        productosApi.list({ limit: 1 }),
        proveedoresApi.list({ limit: 1 }),
        rubrosApi.list(),
        usuariosApi.list({ limit: 1 }),
        stockApi.list({ limit: 1 }),
        stockApi.list({ limit: 1, stock_bajo: true }),
      ]);

      const resumen = resumenRes.data.data as { total_ventas: number; monto_total: number };
      const productos = productosRes.data as ApiResponse<unknown[]>;
      const proveedores = proveedoresRes.data as ApiResponse<unknown[]>;
      const rubros = rubrosRes.data as ApiResponse<unknown[]>;
      const usuarios = usuariosRes.data as ApiResponse<unknown[]>;
      const stock = stockRes.data as ApiResponse<unknown[]>;
      const stockBajo = stockBajoRes.data as ApiResponse<unknown[]>;

      setData({
        ventasHoy: resumen.total_ventas ?? 0,
        montoTotal: resumen.monto_total ?? 0,
        productos: productos.pagination?.total ?? 0,
        proveedores: proveedores.pagination?.total ?? 0,
        rubros: Array.isArray(rubros.data) ? rubros.data.length : 0,
        usuarios: usuarios.pagination?.total ?? 0,
        stockItems: stock.pagination?.total ?? 0,
        stockBajo: stockBajo.pagination?.total ?? 0,
      });
    } catch {
      setError('Error al cargar los datos del dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Bienvenido{user?.nombre_usuario ? `, ${user.nombre_usuario}` : ''}
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={fetchDashboard} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-2 py-4 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm">{error}</span>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.key}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
                <div className={`rounded-md ${stat.bg} p-2`}>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Cargando...</span>
                  </div>
                ) : (
                  <div className="text-2xl font-bold">
                    {formatValue(data[stat.key], stat.format)}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
