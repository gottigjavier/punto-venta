import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  cierresApi,
  type CierreDetail,
  type VentaCierreFila,
  type VentaCierreQueryParams,
} from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowLeft,
  RefreshCw,
  Download,
  AlertTriangle,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  return `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const VENTA_COLORS = ['text-blue-600', 'text-emerald-600', 'text-amber-600', 'text-rose-600'];

/** Build a sequential color map: each unique id_venta gets the next palette index (cyclical every 4). */
function buildColorMap(rows: VentaCierreFila[]): Record<string, number> {
  const map: Record<string, number> = {};
  let idx = 0;
  for (const r of rows) {
    if (!(r.id_venta in map)) {
      map[r.id_venta] = idx % VENTA_COLORS.length;
      idx++;
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// AdministracionDetallePage
// ---------------------------------------------------------------------------

export function AdministracionDetallePage() {
  const { id: cierreId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // State — split: filtrosInput (UI) vs filtrosAplicados (fetch triggers)
  const [filtrosInput, setFiltrosInput] = useState({
    idVenta: '',
    vendedor: '',
    producto: '',
    montoMin: '',
    montoMax: '',
  });
  const [filtrosAplicados, setFiltrosAplicados] = useState({
    idVenta: '',
    vendedor: '',
    producto: '',
    montoMin: '',
    montoMax: '',
  });
  const [sort, setSort] = useState<{
    campo: 'cantidad' | 'monto' | 'id_venta';
    dir: 'asc' | 'desc';
  }>({ campo: 'id_venta', dir: 'asc' });
  const [localSort, setLocalSort] = useState<{
    campo: 'vendedor' | 'producto' | null;
    dir: 'asc' | 'desc';
  }>({ campo: null, dir: 'asc' });
  const [datos, setDatos] = useState<VentaCierreFila[]>([]);
  const [totalMonto, setTotalMonto] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'not_found' | null>(null);
  const [cierreDetail, setCierreDetail] = useState<CierreDetail | null>(null);

  // Fetch cierre detail on mount (once)
  useEffect(() => {
    if (!cierreId) return;
    cierresApi
      .getById(cierreId)
      .then(({ data }) => {
        if (!data.data) {
          setError('not_found');
          return;
        }
        setCierreDetail(data.data);
      })
      .catch((err) => {
        if (err?.response?.status === 404) setError('not_found');
      });
  }, [cierreId]);

  // Fetch sales rows on mount + applied filter/sort changes
  useEffect(() => {
    if (!cierreId) return;
    setLoading(true);
    setError(null);

    const params: VentaCierreQueryParams = {};
    if (filtrosAplicados.idVenta) params.id_venta = filtrosAplicados.idVenta;
    if (filtrosAplicados.vendedor) params.vendedor = filtrosAplicados.vendedor;
    if (filtrosAplicados.producto) params.producto = filtrosAplicados.producto;
    if (filtrosAplicados.montoMin) params.monto_min = parseFloat(filtrosAplicados.montoMin);
    if (filtrosAplicados.montoMax) params.monto_max = parseFloat(filtrosAplicados.montoMax);
    params.sort = sort.campo;
    params.order = sort.dir;

    cierresApi
      .getVentas(cierreId, params)
      .then(({ data }) => {
        if (!data.data) {
          setError('not_found');
          return;
        }
        setDatos(data.data.rows);
        setTotalMonto(data.data.total_monto);
      })
      .catch((err) => {
        if (err?.response?.status === 404) setError('not_found');
      })
      .finally(() => setLoading(false));
  }, [cierreId, filtrosAplicados, sort]);

  // Commit filtrosInput → filtrosAplicados
  const commitFiltros = () => setFiltrosAplicados({ ...filtrosInput });

  const onEnterFiltros = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitFiltros();
  };

  // Handlers
  const onVolver = () => navigate('/administracion');

  const onSort = (campo: 'cantidad' | 'monto' | 'id_venta') => {
    setLocalSort({ campo: null, dir: 'asc' }); // clear local sort when doing server-side
    setSort((prev) =>
      prev.campo === campo
        ? { campo, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { campo, dir: campo === 'id_venta' ? 'asc' : 'desc' },
    );
  };

  const onLocalSort = (campo: 'vendedor' | 'producto') => {
    setLocalSort((prev) =>
      prev.campo === campo
        ? { campo, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { campo, dir: 'asc' },
    );
  };

  const onChangeVendedor = (v: string) =>
    setFiltrosInput((prev) => ({ ...prev, vendedor: v }));

  const onChangeProducto = (v: string) =>
    setFiltrosInput((prev) => ({ ...prev, producto: v }));

  const onChangeMontoMin = (v: string) =>
    setFiltrosInput((prev) => ({ ...prev, montoMin: v }));

  const onChangeMontoMax = (v: string) =>
    setFiltrosInput((prev) => ({ ...prev, montoMax: v }));

  const onChangeIdVenta = (v: string) =>
    setFiltrosInput((prev) => ({ ...prev, idVenta: v }));

  const onClearFiltros = () => {
    const empty = { idVenta: '', vendedor: '', producto: '', montoMin: '', montoMax: '' };
    setFiltrosInput(empty);
    setFiltrosAplicados(empty);
  };

  const onExportCsv = () => {
    const headers = 'ID Venta,Vendedor,Producto,Cantidad,Monto';
    const csvRows = datos.map(
      (r) => `${r.id_venta},${r.vendedor},${r.producto},${r.cantidad},${r.monto}`,
    );
    const csv = [headers, ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cierre-${cierreId}-ventas.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Rows to render: apply local sort when active, otherwise show backend order
  const rowsToShow = useMemo(() => {
    if (!localSort.campo) return datos;
    const sorted = [...datos];
    sorted.sort((a, b) => {
      const va = a[localSort.campo!].toLowerCase();
      const vb = b[localSort.campo!].toLowerCase();
      return localSort.dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    return sorted;
  }, [datos, localSort]);

  // Are any filters applied?
  const hayFiltrosAplicados = Object.values(filtrosAplicados).some((v) => v !== '');

  // Sequential color map — computed from fetched data
  const colorMap = useMemo(() => buildColorMap(datos), [datos]);

  // -----------------------------------------------------------------------
  // Render: loading
  // -----------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
        Cargando ventas del cierre...
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
        <p className="text-lg font-medium">Cierre no encontrado</p>
        <Button variant="outline" className="mt-4" onClick={onVolver}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver a Administración
        </Button>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render: success
  // -----------------------------------------------------------------------
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">
          Cierre #{cierreId?.slice(0, 8) ?? ''}
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onVolver}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver a Administración
          </Button>
          <Button variant="outline" size="sm" onClick={onExportCsv}>
            <Download className="mr-2 h-4 w-4" /> Exportar CSV
          </Button>
        </div>
      </div>

      {/* Cierre summary */}
      {cierreDetail && (
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground text-xs">Apertura</span>
                <p className="font-medium">{formatDate(cierreDetail.fecha_apertura)}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Cierre</span>
                <p className="font-medium">
                  {cierreDetail.fecha_cierre ? formatDate(cierreDetail.fecha_cierre) : '—'}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Usuario apertura</span>
                <p className="font-medium">{cierreDetail.usuario_apertura.nombre_usuario}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Usuario cierre</span>
                <p className="font-medium">
                  {cierreDetail.usuario_cierre?.nombre_usuario ?? '—'}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Monto total</span>
                <p className="font-semibold">{formatCurrency(cierreDetail.monto_total)}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Estado</span>
                <p className="font-medium">{cierreDetail.estado}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters bar */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">ID Venta</Label>
              <Input
                type="text"
                placeholder="Fragmento del UUID..."
                value={filtrosInput.idVenta}
                onChange={(e) => onChangeIdVenta(e.target.value)}
                onKeyDown={onEnterFiltros}
                className="w-[220px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vendedor</Label>
              <Input
                type="text"
                placeholder="Buscar vendedor..."
                value={filtrosInput.vendedor}
                onChange={(e) => onChangeVendedor(e.target.value)}
                onKeyDown={onEnterFiltros}
                className="w-[180px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Producto</Label>
              <Input
                type="text"
                placeholder="Buscar producto..."
                value={filtrosInput.producto}
                onChange={(e) => onChangeProducto(e.target.value)}
                onKeyDown={onEnterFiltros}
                className="w-[180px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Monto Min.</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder="0"
                value={filtrosInput.montoMin}
                onChange={(e) => onChangeMontoMin(e.target.value)}
                onKeyDown={onEnterFiltros}
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
                value={filtrosInput.montoMax}
                onChange={(e) => onChangeMontoMax(e.target.value)}
                onKeyDown={onEnterFiltros}
                className="w-[120px]"
              />
            </div>
            <Button variant="default" size="sm" onClick={commitFiltros}>
              Buscar
            </Button>
            <Button variant="ghost" size="sm" onClick={onClearFiltros}>
              Limpiar filtros
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="pt-6">
          {rowsToShow.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {hayFiltrosAplicados
                ? 'Este cierre no tiene ventas que coincidan con los filtros.'
                : 'Este cierre no tiene ventas registradas.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => onSort('id_venta')}
                    >
                      ID Venta{' '}
                      {sort.campo === 'id_venta' &&
                        (sort.dir === 'asc' ? (
                          <ChevronUp className="inline h-3 w-3" />
                        ) : (
                          <ChevronDown className="inline h-3 w-3" />
                        ))}
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => onLocalSort('vendedor')}
                    >
                      Vendedor{' '}
                      {localSort.campo === 'vendedor' &&
                        (localSort.dir === 'asc' ? (
                          <ChevronUp className="inline h-3 w-3" />
                        ) : (
                          <ChevronDown className="inline h-3 w-3" />
                        ))}
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => onLocalSort('producto')}
                    >
                      Producto{' '}
                      {localSort.campo === 'producto' &&
                        (localSort.dir === 'asc' ? (
                          <ChevronUp className="inline h-3 w-3" />
                        ) : (
                          <ChevronDown className="inline h-3 w-3" />
                        ))}
                    </TableHead>
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
                      onClick={() => onSort('monto')}
                    >
                      Monto{' '}
                      {sort.campo === 'monto' &&
                        (sort.dir === 'asc' ? (
                          <ChevronUp className="inline h-3 w-3" />
                        ) : (
                          <ChevronDown className="inline h-3 w-3" />
                        ))}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rowsToShow.map((fila, idx) => (
                    <TableRow key={`${fila.id_venta}-${idx}`}>
                      <TableCell className={`text-sm font-mono ${VENTA_COLORS[colorMap[fila.id_venta] ?? 0]}`}>
                        {fila.id_venta.slice(0, 8)}
                      </TableCell>
                      <TableCell className="text-sm">{fila.vendedor}</TableCell>
                      <TableCell className="text-sm font-medium">{fila.producto}</TableCell>
                      <TableCell className="text-right text-sm">{fila.cantidad}</TableCell>
                      <TableCell className="text-right text-sm font-semibold">
                        {formatCurrency(fila.monto)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footer */}
      <p className="text-sm text-muted-foreground text-right font-semibold">
        Total: {formatCurrency(totalMonto)}
      </p>
    </div>
  );
}
