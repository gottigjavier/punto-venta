import { useEffect, useState, useCallback } from 'react';
import { lotesApi, stockApi, productosApi, rubrosApi, type LoteItem, type ApiResponse } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Pencil, RefreshCw, Package, Plus, LogIn, Ban, Trash2, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

// --- Types ---
type LoteEstado = LoteItem['estado'];
type SortField =
  | 'numero_lote'
  | 'producto.nombre'
  | 'cantidad_disponible'
  | 'fecha_vencimiento'
  | 'fecha_compra'
  | 'precio_compra'
  | 'created_at';
type SortOrder = 'asc' | 'desc';

interface Rubro { id: string; nombre: string }
interface ProductoOption { id: string; nombre: string; codigo?: string }

// --- Helpers ---
function formatCurrency(value: number): string {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

function estadoLoteBadge(estado: LoteEstado) {
  switch (estado) {
    case 'activo':
      return <Badge variant="success">Activo</Badge>;
    case 'agotado':
      return <Badge variant="outline">Agotado</Badge>;
    case 'vencido':
      return <Badge variant="destructive">Vencido</Badge>;
    case 'descartado':
      return <Badge variant="secondary">Descartado</Badge>;
  }
}

function vencimientoBadge(estado: LoteItem['estado_vencimiento']) {
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
  const [items, setItems] = useState<LoteItem[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [rubroId, setRubroId] = useState<string>('');
  const [stockBajo, setStockBajo] = useState(false);
  const [vencidos, setVencidos] = useState(false);

  // Sort
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Dropdown data
  const [rubros, setRubros] = useState<Rubro[]>([]);
  const [productos, setProductos] = useState<ProductoOption[]>([]);

  // Modal states
  const [loteModal, setLoteModal] = useState<null | 'crear' | 'ingreso'>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<LoteItem | null>(null);
  const [retirarOpen, setRetirarOpen] = useState(false);
  const [retirando, setRetirando] = useState<LoteItem | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [eliminando, setEliminando] = useState<LoteItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form para crear/ingreso
  const INITIAL_LOTE_FORM = {
    producto_id: '',
    numero_lote: '',
    cantidad: '',
    fecha_compra: '',
    fecha_vencimiento: '',
    precio_compra: '',
    cantidad_aviso: '',
  };
  const [loteForm, setLoteForm] = useState(INITIAL_LOTE_FORM);

  // Form para editar (NUNCA cantidad_disponible)
  const INITIAL_EDIT_FORM = {
    numero_lote: '',
    fecha_compra: '',
    fecha_vencimiento: '',
    precio_compra: '',
  };
  const [editForm, setEditForm] = useState(INITIAL_EDIT_FORM);

  // Fetch rubros y productos una vez
  useEffect(() => {
    rubrosApi.list().then(({ data }) => {
      setRubros((data.data as Rubro[]) ?? []);
    }).catch(() => { /* silent */ });
    productosApi.list({ limit: 200, activo: true }).then(({ data }) => {
      setProductos((data.data as ProductoOption[]) ?? []);
    }).catch(() => { /* silent */ });
  }, []);

  // Fetch stock (fila por lote)
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

      const { data } = await lotesApi.list(params);
      const response = data as ApiResponse<LoteItem[]>;
      setItems(response.data ?? []);
      if (response.pagination) setPagination(response.pagination);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [search, rubroId, stockBajo, vencidos, sortField, sortOrder, pagination.limit]);

  useEffect(() => {
    fetchStock(1);
  }, [fetchStock]);

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

  const goToPage = (page: number) => {
    if (page < 1 || page > pagination.totalPages) return;
    fetchStock(page);
  };

  const resetFilters = () => {
    setSearch('');
    setRubroId('');
    setStockBajo(false);
    setVencidos(false);
    setSortField('created_at');
    setSortOrder('desc');
  };

  // --- Handlers de modales ---
  const openLoteModal = (mode: 'crear' | 'ingreso') => {
    setLoteForm(INITIAL_LOTE_FORM);
    setFormError(null);
    setLoteModal(mode);
  };

  const openEdit = (lote: LoteItem) => {
    setEditing(lote);
    setEditForm({
      numero_lote: lote.numero_lote ?? '',
      fecha_compra: lote.fecha_compra ? lote.fecha_compra.slice(0, 10) : '',
      fecha_vencimiento: lote.fecha_vencimiento ? lote.fecha_vencimiento.slice(0, 10) : '',
      precio_compra: String(lote.precio_compra ?? ''),
    });
    setFormError(null);
    setEditOpen(true);
  };

  const openRetirar = (lote: LoteItem) => {
    setRetirando(lote);
    setRetirarOpen(true);
  };

  const openDelete = (lote: LoteItem) => {
    setEliminando(lote);
    setDeleteError(null);
    setDeleteOpen(true);
  };

  const submitLote = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!loteForm.producto_id || !loteForm.cantidad || !loteForm.precio_compra) {
      setFormError('Producto, cantidad y precio de compra son obligatorios.');
      return;
    }
    setSubmitting(true);
    try {
      const base = {
        producto_id: loteForm.producto_id,
        numero_lote: loteForm.numero_lote || null,
        cantidad: Number(loteForm.cantidad),
        fecha_compra: loteForm.fecha_compra || null,
        fecha_vencimiento: loteForm.fecha_vencimiento || null,
        precio_compra: Number(loteForm.precio_compra),
      };
      if (loteModal === 'ingreso') {
        await stockApi.ingreso({
          ...base,
          cantidad_aviso: loteForm.cantidad_aviso ? Number(loteForm.cantidad_aviso) : undefined,
        });
      } else {
        await lotesApi.create(base);
      }
      setLoteModal(null);
      fetchStock(pagination.page);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setFormError(msg ?? 'No se pudo guardar el lote.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setFormError(null);
    setSubmitting(true);
    try {
      await lotesApi.update(editing.id, {
        numero_lote: editForm.numero_lote || null,
        fecha_compra: editForm.fecha_compra || null,
        fecha_vencimiento: editForm.fecha_vencimiento || null,
        precio_compra: editForm.precio_compra ? Number(editForm.precio_compra) : undefined,
      });
      setEditOpen(false);
      fetchStock(pagination.page);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setFormError(msg ?? 'No se pudo editar el lote.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetirar = async () => {
    if (!retirando) return;
    setSubmitting(true);
    try {
      await lotesApi.retirar(retirando.id);
      setRetirarOpen(false);
      fetchStock(pagination.page);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setFormError(msg ?? 'No se pudo retirar el lote.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!eliminando) return;
    setSubmitting(true);
    setDeleteError(null);
    try {
      await lotesApi.delete(eliminando.id);
      setDeleteOpen(false);
      fetchStock(pagination.page);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      // 409: el lote tiene ventas asociadas → solo puede retirarse
      setDeleteError(status === 409
        ? 'El lote tiene ventas asociadas: solo puede retirarse.'
        : (msg ?? 'No se pudo eliminar el lote.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Stock</h1>
          <p className="text-sm text-muted-foreground">Gestioná los lotes (N° de Lote) del inventario</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => openLoteModal('crear')}>
            <Plus className="mr-1 h-4 w-4" /> Nuevo Lote
          </Button>
          <Button variant="outline" onClick={() => openLoteModal('ingreso')}>
            <LogIn className="mr-1 h-4 w-4" /> Ingreso de Stock
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          {/* Filters row */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, código o N° de Lote..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={rubroId} onValueChange={(v) => setRubroId(v === 'all' ? '' : v)}>
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

            <Button variant={stockBajo ? 'default' : 'outline'} size="sm" onClick={() => setStockBajo((p) => !p)}>
              Stock bajo
            </Button>

            <Button variant={vencidos ? 'default' : 'outline'} size="sm" onClick={() => setVencidos((p) => !p)}>
              Vencidos
            </Button>

            <Button variant="outline" size="icon" onClick={() => fetchStock(pagination.page)}>
              <RefreshCw className="h-4 w-4" />
            </Button>

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
              <p>No hay lotes en stock</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('numero_lote')}>
                        N° de Lote <SortIcon field="numero_lote" />
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('producto.nombre')}>
                        Producto <SortIcon field="producto.nombre" />
                      </TableHead>
                      <TableHead>Rubro</TableHead>
                      <TableHead className="max-w-[140px]">Proveedor</TableHead>
                      <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort('cantidad_disponible')}>
                        Cant. Disponible <SortIcon field="cantidad_disponible" />
                      </TableHead>
                      <TableHead>Fecha Compra</TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('fecha_vencimiento')}>
                        Vencimiento <SortIcon field="fecha_vencimiento" />
                      </TableHead>
                      <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort('precio_compra')}>
                        P. Compra <SortIcon field="precio_compra" />
                      </TableHead>
                      <TableHead className="text-center">Estado Lote</TableHead>
                      <TableHead className="text-center">Vencimiento</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="font-mono text-xs">{l.numero_lote || '—'}</TableCell>
                        <TableCell className="font-medium">
                          {l.producto?.nombre}
                          <span className="block text-xs font-normal text-muted-foreground">
                            {l.producto?.codigo || '—'}
                          </span>
                        </TableCell>
                        <TableCell>{l.rubro?.nombre ?? '—'}</TableCell>
                        <TableCell className="max-w-[140px] truncate">{l.proveedor?.razon_social ?? '—'}</TableCell>
                        <TableCell className={`text-right font-semibold ${l.stock_bajo ? 'text-blue-500' : ''}`}>
                          {l.cantidad_disponible}
                        </TableCell>
                        <TableCell>{formatDate(l.fecha_compra)}</TableCell>
                        <TableCell>{formatDate(l.fecha_vencimiento)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(l.precio_compra)}</TableCell>
                        <TableCell className="text-center">{estadoLoteBadge(l.estado)}</TableCell>
                        <TableCell className="text-center">{vencimientoBadge(l.estado_vencimiento)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(l)} title="Editar">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openRetirar(l)} title="Retirar">
                              <Ban className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => openDelete(l)} title="Eliminar">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
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
                    {' - '}
                    {Math.min(pagination.page * pagination.limit, pagination.total)}
                    {' '}de {pagination.total}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-8 w-8" disabled={pagination.page <= 1} onClick={() => goToPage(pagination.page - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                      .filter((p) => p === 1 || p === pagination.totalPages || Math.abs(p - pagination.page) <= 1)
                      .reduce<(number | 'dots')[]>((acc, p, i, arr) => {
                        if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('dots');
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((item, i) =>
                        item === 'dots' ? (
                          <span key={`dots-${i}`} className="px-1 text-muted-foreground">...</span>
                        ) : (
                          <Button key={item} variant={pagination.page === item ? 'default' : 'outline'} size="icon" className="h-8 w-8" onClick={() => goToPage(item)}>
                            {item}
                          </Button>
                        )
                      )}
                    <Button variant="outline" size="icon" className="h-8 w-8" disabled={pagination.page >= pagination.totalPages} onClick={() => goToPage(pagination.page + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Create / Ingreso Dialog */}
      <Dialog open={loteModal !== null} onOpenChange={(o) => !o && setLoteModal(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{loteModal === 'ingreso' ? 'Ingreso de Stock' : 'Nuevo Lote'}</DialogTitle>
            <DialogDescription>
              {loteModal === 'ingreso'
                ? 'Crea o suma unidades a un lote existente (por N° de Lote y vencimiento).'
                : 'Crea un lote nuevo para un producto existente.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitLote} className="space-y-4">
            <div className="space-y-2">
              <Label>Producto *</Label>
              <Select value={loteForm.producto_id} onValueChange={(v) => setLoteForm((f) => ({ ...f, producto_id: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar producto" />
                </SelectTrigger>
                <SelectContent>
                  {productos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nombre} {p.codigo ? `(${p.codigo})` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="numero_lote">N° de Lote</Label>
                <Input id="numero_lote" value={loteForm.numero_lote} onChange={(e) => setLoteForm((f) => ({ ...f, numero_lote: e.target.value }))} placeholder="Opcional" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cantidad">Cantidad *</Label>
                <Input id="cantidad" type="number" step="0.001" min="0" value={loteForm.cantidad} onChange={(e) => setLoteForm((f) => ({ ...f, cantidad: e.target.value }))} placeholder="0" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fecha_compra">Fecha Compra</Label>
                <Input id="fecha_compra" type="date" value={loteForm.fecha_compra} onChange={(e) => setLoteForm((f) => ({ ...f, fecha_compra: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fecha_vencimiento">Fecha Vencimiento</Label>
                <Input id="fecha_vencimiento" type="date" value={loteForm.fecha_vencimiento} onChange={(e) => setLoteForm((f) => ({ ...f, fecha_vencimiento: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="precio_compra">Precio Compra *</Label>
                <Input id="precio_compra" type="number" step="0.01" min="0" value={loteForm.precio_compra} onChange={(e) => setLoteForm((f) => ({ ...f, precio_compra: e.target.value }))} placeholder="0.00" />
              </div>
              {loteModal === 'ingreso' && (
                <div className="space-y-2">
                  <Label htmlFor="cantidad_aviso">Cantidad Aviso</Label>
                  <Input id="cantidad_aviso" type="number" min="0" value={loteForm.cantidad_aviso} onChange={(e) => setLoteForm((f) => ({ ...f, cantidad_aviso: e.target.value }))} placeholder="0" />
                </div>
              )}
            </div>
            {formError && <p className="text-sm font-medium text-destructive">{formError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setLoteModal(null)} disabled={submitting}>Cancelar</Button>
              <Button type="submit" disabled={submitting}>{submitting ? 'Guardando...' : 'Guardar'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog — NUNCA cantidad_disponible */}
      <Dialog open={editOpen} onOpenChange={(o) => !o && setEditOpen(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Lote</DialogTitle>
            <DialogDescription>Modificá los metadatos del lote. El stock no se altera.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitEdit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit_numero_lote">N° de Lote</Label>
              <Input id="edit_numero_lote" value={editForm.numero_lote} onChange={(e) => setEditForm((f) => ({ ...f, numero_lote: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_fecha_compra">Fecha Compra</Label>
                <Input id="edit_fecha_compra" type="date" value={editForm.fecha_compra} onChange={(e) => setEditForm((f) => ({ ...f, fecha_compra: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_fecha_vencimiento">Fecha Vencimiento</Label>
                <Input id="edit_fecha_vencimiento" type="date" value={editForm.fecha_vencimiento} onChange={(e) => setEditForm((f) => ({ ...f, fecha_vencimiento: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_precio_compra">Precio Compra</Label>
              <Input id="edit_precio_compra" type="number" step="0.01" min="0" value={editForm.precio_compra} onChange={(e) => setEditForm((f) => ({ ...f, precio_compra: e.target.value }))} placeholder="0.00" />
            </div>
            {formError && <p className="text-sm font-medium text-destructive">{formError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={submitting}>Cancelar</Button>
              <Button type="submit" disabled={submitting}>{submitting ? 'Guardando...' : 'Guardar Cambios'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Retirar Confirmation */}
      <Dialog open={retirarOpen} onOpenChange={(o) => !o && setRetirarOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retirar Lote</DialogTitle>
            <DialogDescription>
              Vas a marcar el lote <span className="font-semibold text-foreground">{retirando?.numero_lote || '—'}</span> como descartado. No se podrá vender y conservará su historial.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRetirarOpen(false)} disabled={submitting}>Cancelar</Button>
            <Button type="button" variant="destructive" onClick={handleRetirar} disabled={submitting}>{submitting ? 'Retirando...' : 'Retirar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteOpen} onOpenChange={(o) => !o && setDeleteOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar Lote</DialogTitle>
            <DialogDescription>
              Estás seguro que querés eliminar el lote <span className="font-semibold text-foreground">{eliminando?.numero_lote || '—'}</span>? Esta acción no se puede deshacer.
            </DialogDescription>
            {deleteError && <p className="text-sm font-medium text-destructive">{deleteError}</p>}
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)} disabled={submitting}>Cancelar</Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={submitting}>{submitting ? 'Eliminando...' : 'Eliminar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
