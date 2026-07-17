import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  cierresApi,
  type CierreDetail,
  type CierreDetalle,
} from '@/lib/api-client';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  RefreshCw,
  Download,
  AlertTriangle,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers (copiados de AdministracionPage — funciones puras)
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  return `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
// Types
// ---------------------------------------------------------------------------

interface DetalleFilters {
  tipo: string;
  nombre: string;
  montoMin: string;
  montoMax: string;
}

interface SortConfig {
  campo: 'cantidad' | 'monto_total';
  dir: 'asc' | 'desc';
}

// ---------------------------------------------------------------------------
// Pure logic (exportable for tests)
// ---------------------------------------------------------------------------

export function aplicarFiltrosOrden(
  detalles: CierreDetalle[],
  filtros: DetalleFilters,
  sort: SortConfig,
): CierreDetalle[] {
  let result = [...detalles];

  if (filtros.tipo) {
    result = result.filter((d) => d.tipo === filtros.tipo);
  }

  if (filtros.nombre) {
    const needle = filtros.nombre.toLowerCase();
    result = result.filter((d) => d.nombre.toLowerCase().includes(needle));
  }

  if (filtros.montoMin) {
    const min = parseFloat(filtros.montoMin);
    if (!isNaN(min)) result = result.filter((d) => d.monto_total >= min);
  }

  if (filtros.montoMax) {
    const max = parseFloat(filtros.montoMax);
    if (!isNaN(max)) result = result.filter((d) => d.monto_total <= max);
  }

  result.sort((a, b) => {
    const valA = a[sort.campo];
    const valB = b[sort.campo];
    return sort.dir === 'asc' ? valA - valB : valB - valA;
  });

  return result;
}

// ---------------------------------------------------------------------------
// AdministracionDetallePage
// ---------------------------------------------------------------------------

export function AdministracionDetallePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // State
  const [cierre, setCierre] = useState<CierreDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'not_found' | 'network' | null>(null);
  const [filtros, setFiltros] = useState<DetalleFilters>({
    tipo: '',
    nombre: '',
    montoMin: '',
    montoMax: '',
  });
  const [sort, setSort] = useState<SortConfig>({ campo: 'monto_total', dir: 'desc' });
  const [exporting, setExporting] = useState(false);

  // Load cierre on mount
  useEffect(() => {
    if (!id) {
      setError('not_found');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    cierresApi
      .getById(id)
      .then(({ data }) => {
        if (!data.data) {
          setError('not_found');
          return;
        }
        setCierre(data.data as CierreDetail);
      })
      .catch((err) => {
        if (err?.response?.status === 404) {
          setError('not_found');
        } else {
          setError('network');
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  // Derived: filtered + sorted details
  const detallesFiltrados = useMemo(
    () => (cierre ? aplicarFiltrosOrden(cierre.detalles, filtros, sort) : []),
    [cierre, filtros, sort],
  );

  // Handlers
  const onVolver = () => navigate('/administracion');

  const onExport = async () => {
    if (!cierre) return;
    setExporting(true);
    try {
      const response = await cierresApi.exportCsv(cierre.id);
      const blob = new Blob([response.data as BlobPart], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `cierre-${cierre.id}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      /* noop */
    } finally {
      setExporting(false);
    }
  };

  const onSort = (campo: 'cantidad' | 'monto_total') => {
    setSort((prev) =>
      prev.campo === campo
        ? { campo, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { campo, dir: 'asc' },
    );
  };

  const onChangeTipo = (v: string) => setFiltros((prev) => ({ ...prev, tipo: v === 'all' ? '' : v }));
  const onChangeNombre = (v: string) => setFiltros((prev) => ({ ...prev, nombre: v }));
  const onChangeMontoMin = (v: string) => setFiltros((prev) => ({ ...prev, montoMin: v }));
  const onChangeMontoMax = (v: string) => setFiltros((prev) => ({ ...prev, montoMax: v }));
  const onClearFiltros = () => setFiltros({ tipo: '', nombre: '', montoMin: '', montoMax: '' });

  // -----------------------------------------------------------------------
  // Render: loading
  // -----------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
        Cargando cierre...
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render: error
  // -----------------------------------------------------------------------
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <AlertTriangle className="mb-2 h-8 w-8 text-destructive" />
        <p className="text-lg font-medium">
          {error === 'not_found' ? 'Cierre no encontrado' : 'Error al cargar el cierre'}
        </p>
        <Button variant="outline" className="mt-4" onClick={onVolver}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver a Administración
        </Button>
      </div>
    );
  }

  if (!cierre) return null;

  // -----------------------------------------------------------------------
  // Render: success
  // -----------------------------------------------------------------------
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cierre #{cierre.id.slice(0, 8)}</h1>
          <p className="text-sm text-muted-foreground">
            {cierre.fecha_cierre ? formatDate(cierre.fecha_cierre) : 'Sin fecha de cierre'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onVolver}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver a Administración
          </Button>
          <Button variant="outline" size="sm" disabled={exporting} onClick={onExport}>
            {exporting ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Exportando...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" /> Exportar CSV
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Cierre info */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Fecha Apertura</p>
              <p className="font-medium">{formatDate(cierre.fecha_apertura)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Fecha Cierre</p>
              <p className="font-medium">
                {cierre.fecha_cierre ? formatDate(cierre.fecha_cierre) : '---'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Vendedor Apertura</p>
              <p className="font-medium">
                {cierre.usuario_apertura?.nombre_usuario ?? '---'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Vendedor Cierre</p>
              <p className="font-medium">
                {cierre.usuario_cierre?.nombre_usuario ?? '---'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Estado</p>
              <div>{estadoBadge(cierre.estado)}</div>
            </div>
            <div>
              <p className="text-muted-foreground">Cant. Ventas</p>
              <p className="font-medium">{cierre.cantidad_ventas}</p>
            </div>
            <div className="md:col-span-2">
              <p className="text-muted-foreground">Monto Total</p>
              <p className="font-bold text-lg">{formatCurrency(cierre.monto_total)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters bar */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <Select value={filtros.tipo || 'all'} onValueChange={onChangeTipo}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="vendedor">Vendedor</SelectItem>
                  <SelectItem value="producto">Producto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nombre</Label>
              <Input
                type="text"
                placeholder="Buscar..."
                value={filtros.nombre}
                onChange={(e) => onChangeNombre(e.target.value)}
                className="w-[200px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Monto Min.</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder="0"
                value={filtros.montoMin}
                onChange={(e) => onChangeMontoMin(e.target.value)}
                className="w-[120px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Monto Max.</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder="Sin limite"
                value={filtros.montoMax}
                onChange={(e) => onChangeMontoMax(e.target.value)}
                className="w-[120px]"
              />
            </div>
            <Button variant="ghost" size="sm" onClick={onClearFiltros}>
              Limpiar filtros
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Detalles table */}
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground mb-3">
            Mostrando {detallesFiltrados.length} de {cierre.detalles.length} detalles
          </p>

          {cierre.detalles.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Este cierre no tiene detalles.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead
                      className="text-right cursor-pointer select-none"
                      onClick={() => onSort('cantidad')}
                    >
                      Cantidad{' '}
                      {sort.campo === 'cantidad' &&
                        (sort.dir === 'asc' ? (
                          <ChevronUp className="inline h-3 w-3" />
                        ) : (
                          <ChevronDown className="inline h-3 w-3" />
                        ))}
                    </TableHead>
                    <TableHead
                      className="text-right cursor-pointer select-none"
                      onClick={() => onSort('monto_total')}
                    >
                      Monto Total{' '}
                      {sort.campo === 'monto_total' &&
                        (sort.dir === 'asc' ? (
                          <ChevronUp className="inline h-3 w-3" />
                        ) : (
                          <ChevronDown className="inline h-3 w-3" />
                        ))}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detallesFiltrados.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="text-sm">
                        <Badge variant={d.tipo === 'vendedor' ? 'default' : 'secondary'}>
                          {d.tipo}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm font-medium">{d.nombre}</TableCell>
                      <TableCell className="text-right text-sm">{d.cantidad}</TableCell>
                      <TableCell className="text-right text-sm font-semibold">
                        {formatCurrency(d.monto_total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
