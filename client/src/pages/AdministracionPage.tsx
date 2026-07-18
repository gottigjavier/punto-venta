import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  cierresApi,
  type CierreListItem,
} from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ShieldCheck,
  RefreshCw,
  Eye,
  AlertTriangle,
  X,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  return `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function estadoBadge(estado: string) {
  switch (estado) {
    case 'cerrado':
      return <Badge variant="success">Cerrado</Badge>;
    case 'abierto':
      return <Badge variant="outline">Abierto</Badge>;
    default:
      return <Badge variant="secondary">{estado}</Badge>;
  }
}

// ---------------------------------------------------------------------------
// AdministracionPage
// ---------------------------------------------------------------------------

export function AdministracionPage() {
  const navigate = useNavigate();

  // Data
  const [cierres, setCierres] = useState<CierreListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [networkError, setNetworkError] = useState('');
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  // Filters
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  // -----------------------------------------------------------------------
  // Fetch cierres
  // -----------------------------------------------------------------------
  const fetchCierres = useCallback(
    async (page = 1) => {
      setLoading(true);
      setNetworkError('');
      try {
        const params: Record<string, unknown> = {
          page,
          limit: pagination.limit,
          sort: 'fecha_cierre',
          order: 'desc',
        };
        if (fechaDesde) params.fecha_desde = fechaDesde;
        if (fechaHasta) params.fecha_hasta = fechaHasta;

        const { data } = await cierresApi.list(params);
        setCierres((data.data as CierreListItem[]) ?? []);
        if (data.pagination) {
          setPagination(data.pagination as Pagination);
        }
      } catch {
        setNetworkError('Error al cargar los cierres de caja');
      } finally {
        setLoading(false);
      }
    },
    [pagination.limit, fechaDesde, fechaHasta],
  );

  useEffect(() => {
    fetchCierres(1);
  }, [fetchCierres]);

  // -----------------------------------------------------------------------
  // Reset filters
  // -----------------------------------------------------------------------
  const resetFilters = () => {
    setFechaDesde('');
    setFechaHasta('');
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-6 w-6" />
          Administración - Cierres de Caja
        </h1>
        <p className="text-sm text-muted-foreground">
          Consultá el historial de cierres de caja, filtrá y exportá datos.
        </p>
      </div>

      {/* Network error banner */}
      {networkError && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{networkError}</span>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-6 w-6"
            onClick={() => setNetworkError('')}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Fecha Desde</Label>
              <Input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="w-[160px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fecha Hasta</Label>
              <Input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="w-[160px]"
              />
            </div>
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              Limpiar
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Cargando cierres...
            </div>
          ) : cierres.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileSpreadsheet className="mb-2 h-8 w-8" />
              <p>No hay cierres de caja registrados</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha Cierre</TableHead>
                      <TableHead>Vendedor Cierre</TableHead>
                      <TableHead className="text-right">Monto Total</TableHead>
                      <TableHead className="text-center">Cant. Ventas</TableHead>
                      <TableHead className="text-center">Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cierres.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="text-sm">
                          {c.fecha_cierre ? formatDate(c.fecha_cierre) : '---'}
                        </TableCell>
                        <TableCell className="font-medium">
                          {c.usuario_cierre?.nombre_usuario ?? '---'}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(c.monto_total)}
                        </TableCell>
                        <TableCell className="text-center">{c.cantidad_ventas}</TableCell>
                        <TableCell className="text-center">
                          {estadoBadge('cerrado')}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => navigate(`/administracion/${c.id}`)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Mostrando {(pagination.page - 1) * pagination.limit + 1}
                    {' '}-{' '}
                    {Math.min(pagination.page * pagination.limit, pagination.total)}
                    {' '}de {pagination.total}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagination.page <= 1}
                      onClick={() => fetchCierres(pagination.page - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Anterior
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Pagina {pagination.page} de {pagination.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagination.page >= pagination.totalPages}
                      onClick={() => fetchCierres(pagination.page + 1)}
                    >
                      Siguiente
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
