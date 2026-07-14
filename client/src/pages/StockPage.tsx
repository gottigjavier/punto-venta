import { useEffect, useState, useCallback } from 'react';
import { stockApi, rubrosApi, type ApiResponse } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Pencil, RefreshCw, Package, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

// --- Types ---

interface StockItem {
  id: string;
  nombre: string;
  codigo: string;
  cantidad_disponible: number;
  cantidad_aviso: number;
  precio_venta: number;
  fecha_vencimiento: string | null;
  rubro: { id: string; nombre: string };
  proveedor: { id: string; razon_social: string };
  estado_vencimiento: 'vencido' | 'por_vencer' | 'ok';
  stock_bajo: boolean;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface Rubro {
  id: string;
  nombre: string;
}

type SortField =
  | 'nombre'
  | 'codigo'
  | 'cantidad_disponible'
  | 'cantidad_aviso'
  | 'precio_venta'
  | 'fecha_vencimiento'
  | 'created_at';

type SortOrder = 'asc' | 'desc';

// --- Helpers ---

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function vencimientoBadge(estado: StockItem['estado_vencimiento']) {
  switch (estado) {
    case 'vencido':
      return <Badge variant="destructive">Vencido</Badge>;
    case 'por_vencer':
      return <Badge variant="outline">Por vencer</Badge>;
    case 'ok':
      return <Badge variant="success">OK</Badge>;
  }
}

// --- Component ---

export function StockPage() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [rubroId, setRubroId] = useState<string>('');
  const [stockBajo, setStockBajo] = useState(false);
  const [vencidos, setVencidos] = useState(false);

  // Sort
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Rubros for filter dropdown
  const [rubros, setRubros] = useState<Rubro[]>([]);

  // Fetch rubros once
  useEffect(() => {
    rubrosApi.list().then(({ data }) => {
      setRubros((data.data as Rubro[]) ?? []);
    }).catch(() => { /* silent */ });
  }, []);

  // Fetch stock
  const fetchStock = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {
        page,
        limit: pagination.limit,
        sort: sortField,
        order: sortOrder,
      };
      if (search) params.search = search;
      if (rubroId) params.rubro_id = rubroId;
      if (stockBajo) params.stock_bajo = true;
      if (vencidos) params.vencidos = true;

      const { data } = await stockApi.list(params);
      const response = data as ApiResponse<StockItem[]>;
      setItems(response.data ?? []);
      if (response.pagination) {
        setPagination(response.pagination);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [search, rubroId, stockBajo, vencidos, sortField, sortOrder, pagination.limit]);

  // Fetch on filter/sort change
  useEffect(() => {
    fetchStock(1);
  }, [fetchStock]);

  // Sorting
  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="ml-1 h-3 w-3 text-muted-foreground" />;
    return sortOrder === 'asc'
      ? <ArrowUp className="ml-1 h-3 w-3" />
      : <ArrowDown className="ml-1 h-3 w-3" />;
  };

  // Pagination
  const goToPage = (page: number) => {
    if (page < 1 || page > pagination.totalPages) return;
    fetchStock(page);
  };

  // Reset filters
  const resetFilters = () => {
    setSearch('');
    setRubroId('');
    setStockBajo(false);
    setVencidos(false);
    setSortField('created_at');
    setSortOrder('desc');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Stock</h1>
          <p className="text-sm text-muted-foreground">Gestioná el inventario de productos</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          {/* Filters row */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o código..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Rubro filter */}
            <Select
              value={rubroId}
              onValueChange={(v) => setRubroId(v === 'all' ? '' : v)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Todos los rubros" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los rubros</SelectItem>
                {rubros.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Toggle: Stock bajo */}
            <Button
              variant={stockBajo ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStockBajo((prev) => !prev)}
            >
              Stock bajo
            </Button>

            {/* Toggle: Vencidos */}
            <Button
              variant={vencidos ? 'default' : 'outline'}
              size="sm"
              onClick={() => setVencidos((prev) => !prev)}
            >
              Vencidos
            </Button>

            {/* Refresh */}
            <Button variant="outline" size="icon" onClick={() => fetchStock(pagination.page)}>
              <RefreshCw className="h-4 w-4" />
            </Button>

            {/* Reset */}
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              Limpiar filtros
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Cargando...
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Package className="mb-2 h-8 w-8" />
              <p>No hay productos en stock</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead
                        className="cursor-pointer select-none"
                        onClick={() => toggleSort('codigo')}
                      >
                        Código <SortIcon field="codigo" />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer select-none"
                        onClick={() => toggleSort('nombre')}
                      >
                        Nombre <SortIcon field="nombre" />
                      </TableHead>
                      <TableHead>Rubro</TableHead>
                      <TableHead className="max-w-[140px]">Proveedor</TableHead>
                      <TableHead
                        className="text-right cursor-pointer select-none"
                        onClick={() => toggleSort('cantidad_disponible')}
                      >
                        Stock Disponible <SortIcon field="cantidad_disponible" />
                      </TableHead>
                      <TableHead
                        className="text-right cursor-pointer select-none"
                        onClick={() => toggleSort('cantidad_aviso')}
                      >
                        Cant. Aviso <SortIcon field="cantidad_aviso" />
                      </TableHead>
                      <TableHead
                        className="text-right cursor-pointer select-none"
                        onClick={() => toggleSort('precio_venta')}
                      >
                        P. Venta <SortIcon field="precio_venta" />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer select-none"
                        onClick={() => toggleSort('fecha_vencimiento')}
                      >
                        Vencimiento <SortIcon field="fecha_vencimiento" />
                      </TableHead>
                      <TableHead className="text-center">Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((p) => {
                      const alerta =
                        (p.cantidad_aviso ?? 0) > 0 &&
                        (p.cantidad_disponible ?? 0) < (p.cantidad_aviso ?? 0);
                      const stockClass = alerta ? 'text-blue-500' : '';

                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-mono text-xs">
                            {p.codigo || '—'}
                          </TableCell>
                          <TableCell className="font-medium">{p.nombre}</TableCell>
                          <TableCell>{p.rubro?.nombre ?? '—'}</TableCell>
                          <TableCell className="max-w-[140px] truncate">
                            {p.proveedor?.razon_social ?? '—'}
                          </TableCell>
                          <TableCell className={`text-right font-semibold ${stockClass}`}>
                            {p.cantidad_disponible}
                          </TableCell>
                          <TableCell className="text-right">{p.cantidad_aviso}</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(p.precio_venta)}
                          </TableCell>
                          <TableCell>{formatDate(p.fecha_vencimiento)}</TableCell>
                          <TableCell className="text-center">
                            {vencimientoBadge(p.estado_vencimiento)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
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
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={pagination.page <= 1}
                      onClick={() => goToPage(pagination.page - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                      .filter((p) => {
                        // Show first, last, and nearby pages
                        if (p === 1 || p === pagination.totalPages) return true;
                        return Math.abs(p - pagination.page) <= 1;
                      })
                      .reduce<(number | 'dots')[]>((acc, p, i, arr) => {
                        if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('dots');
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((item, i) =>
                        item === 'dots' ? (
                          <span key={`dots-${i}`} className="px-1 text-muted-foreground">...</span>
                        ) : (
                          <Button
                            key={item}
                            variant={pagination.page === item ? 'default' : 'outline'}
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => goToPage(item)}
                          >
                            {item}
                          </Button>
                        )
                      )}
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={pagination.page >= pagination.totalPages}
                      onClick={() => goToPage(pagination.page + 1)}
                    >
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
