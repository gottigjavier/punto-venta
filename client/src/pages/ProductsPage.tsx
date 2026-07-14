import { useEffect, useState, useCallback } from 'react';
import { productosApi, rubrosApi, proveedoresApi } from '@/lib/api-client';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Package, Plus, Pencil, Trash2, Search, RefreshCw } from 'lucide-react';

interface Producto {
  id: string;
  nombre: string;
  codigo?: string;
  precio_venta?: string | number;
  precio_compra?: string | number;
  stock_actual?: string | number;
  cantidad_disponible?: number;
  cantidad_aviso?: number;
  activo: boolean;
  rubro?: { id: string; nombre: string };
  proveedor?: { id: string; razon_social: string };
  unidad_medida?: string;
  fecha_compra?: string;
  fecha_vencimiento?: string;
  numero_remesa?: string;
}

interface Rubro {
  id: string;
  nombre: string;
  activo: boolean;
}

interface Proveedor {
  id: string;
  razon_social: string;
}

const UNIDADES = ['kg', 'g', 'l', 'ml', 'unidad'] as const;

const INITIAL_FORM = {
  nombre: '',
  codigo: '',
  precio_compra: '',
  precio_venta: '',
  cantidad_disponible: '0',
  rubro_id: '',
  proveedor_id: '',
  cantidad_aviso: '0',
  unidad_medida: 'unidad',
  fecha_compra: '',
  fecha_vencimiento: '',
  numero_remesa: '',
};

export function ProductsPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Dropdown data
  const [rubros, setRubros] = useState<Rubro[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);

  // Modal states
  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editing, setEditing] = useState<Producto | null>(null);
  const [deleting, setDeleting] = useState<Producto | null>(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProductos = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { limit: 50 };
      if (search) params.search = search;
      const { data } = await productosApi.list(params);
      setProductos(data.data as Producto[]);
    } catch (e) {
      console.error('Error cargando productos:', e);
      setError('No se pudieron cargar los productos.');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchProductos();
  }, [fetchProductos]);

  // Load dropdown data once
  useEffect(() => {
    rubrosApi.list().then(({ data }) => {
      setRubros((data.data as Rubro[]).filter((r) => r.activo));
    }).catch((e) => {
      console.error('Error cargando rubros:', e);
    });
    proveedoresApi.list({ limit: 100 }).then(({ data }) => {
      setProveedores(data.data as Proveedor[]);
    }).catch((e) => {
      console.error('Error cargando proveedores:', e);
    });
  }, []);

  // -- Form handlers --
  const openCreate = () => {
    setEditing(null);
    setForm(INITIAL_FORM);
    setFormOpen(true);
  };

  const openEdit = (producto: Producto) => {
    setEditing(producto);
    setForm({
      nombre: producto.nombre,
      codigo: producto.codigo ?? '',
      precio_compra: producto.precio_compra != null ? String(producto.precio_compra) : '',
      precio_venta: producto.precio_venta != null ? String(producto.precio_venta) : '',
      cantidad_disponible: producto.cantidad_disponible != null ? String(producto.cantidad_disponible) : '0',
      rubro_id: producto.rubro?.id ?? '',
      proveedor_id: producto.proveedor?.id ?? '',
      cantidad_aviso: producto.cantidad_aviso != null ? String(producto.cantidad_aviso) : '0',
      unidad_medida: producto.unidad_medida ?? 'unidad',
      fecha_compra: producto.fecha_compra ?? '',
      fecha_vencimiento: producto.fecha_vencimiento ?? '',
      numero_remesa: producto.numero_remesa ?? '',
    });
    setFormOpen(true);
  };

  const isFormValid = (): boolean => {
    if (!form.nombre.trim()) return false;
    if (!form.codigo.trim()) return false;
    if (form.precio_compra === '' || Number(form.precio_compra) < 0) return false;
    if (form.precio_venta === '' || Number(form.precio_venta) < 0) return false;
    if (form.cantidad_disponible === '' || Number(form.cantidad_disponible) < 0) return false;
    if (!form.rubro_id) return false;
    if (!form.proveedor_id) return false;
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid()) return;
    setSubmitting(true);
    try {
      setError(null);
      const payload: Record<string, unknown> = {
        nombre: form.nombre.trim(),
        codigo: form.codigo.trim(),
        precio_compra: Number(form.precio_compra),
        precio_venta: Number(form.precio_venta),
        cantidad_disponible: Number(form.cantidad_disponible),
        rubro_id: form.rubro_id,
        proveedor_id: form.proveedor_id,
        unidad_medida: form.unidad_medida,
      };
      const cantAviso = Number(form.cantidad_aviso);
      if (!isNaN(cantAviso) && cantAviso >= 0) payload.cantidad_aviso = cantAviso;
      if (form.fecha_compra) payload.fecha_compra = form.fecha_compra;
      if (form.fecha_vencimiento) payload.fecha_vencimiento = form.fecha_vencimiento;
      if (form.numero_remesa.trim()) payload.numero_remesa = form.numero_remesa.trim();

      if (editing) {
        await productosApi.update(editing.id, payload);
      } else {
        await productosApi.create(payload);
      }
      setFormOpen(false);
      setError(null);
      fetchProductos();
    } catch (e) {
      console.error('Error guardando producto:', e);
      setError('No se pudo guardar el producto. Verifica los datos e intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  // -- Delete handlers --
  const openDelete = (producto: Producto) => {
    setDeleting(producto);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setSubmitting(true);
    try {
      await productosApi.delete(deleting.id);
      setDeleteOpen(false);
      setDeleting(null);
      setError(null);
      fetchProductos();
    } catch (e) {
      console.error('Error eliminando producto:', e);
      setError('No se pudo eliminar el producto. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Productos</h1>
          <p className="text-sm text-muted-foreground">Gestioná el catálogo de productos</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Producto
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
          <button
            type="button"
            className="ml-2 underline hover:no-underline"
            onClick={() => setError(null)}
          >
            Cerrar
          </button>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar productos..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button variant="outline" size="icon" onClick={fetchProductos}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Cargando...
            </div>
          ) : productos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Package className="mb-2 h-8 w-8" />
              <p>No hay productos todavía</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Rubro</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead className="text-right">P. Compra</TableHead>
                    <TableHead className="text-right">P. Venta</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-center">Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productos.map((p) => {
                    const alerta = (p.cantidad_aviso ?? 0) > 0 && (p.cantidad_disponible ?? 0) < (p.cantidad_aviso ?? 0);
                    const stockClass = alerta ? 'text-blue-500' : '';
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs">{p.codigo ?? '—'}</TableCell>
                        <TableCell className="font-medium">{p.nombre}</TableCell>
                        <TableCell>{p.rubro?.nombre ?? '—'}</TableCell>
                        <TableCell className="max-w-[150px] truncate">{p.proveedor?.razon_social ?? '—'}</TableCell>
                        <TableCell className="text-right">
                          {p.precio_compra ? `$${Number(p.precio_compra).toFixed(2)}` : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          {p.precio_venta ? `$${Number(p.precio_venta).toFixed(2)}` : '—'}
                        </TableCell>
                        <TableCell className={`text-right font-semibold ${stockClass}`}>{String(p.stock_actual ?? '—')}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={p.activo ? 'success' : 'secondary'}>
                            {p.activo ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEdit(p)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => openDelete(p)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Producto' : 'Nuevo Producto'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Modifica los datos del producto.'
                : 'Completá los datos para crear un producto nuevo.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Row 1: Nombre + Codigo */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre *</Label>
                <Input
                  id="nombre"
                  value={form.nombre}
                  onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                  placeholder="Nombre del producto"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="codigo">Codigo *</Label>
                <Input
                  id="codigo"
                  value={form.codigo}
                  onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))}
                  placeholder="Codigo del producto"
                />
              </div>
            </div>

            {/* Row 2: Precios */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="precio_compra">Precio Compra *</Label>
                <Input
                  id="precio_compra"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.precio_compra}
                  onChange={(e) => setForm((f) => ({ ...f, precio_compra: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="precio_venta">Precio Venta *</Label>
                <Input
                  id="precio_venta"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.precio_venta}
                  onChange={(e) => setForm((f) => ({ ...f, precio_venta: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Row 2b: Cantidad Disponible */}
            <div className="space-y-2">
              <Label htmlFor="cantidad_disponible">Cantidad en Stock *</Label>
              <Input
                id="cantidad_disponible"
                type="number"
                step="0.001"
                min="0"
                value={form.cantidad_disponible}
                onChange={(e) => setForm((f) => ({ ...f, cantidad_disponible: e.target.value }))}
                placeholder="0"
              />
            </div>

            {/* Row 3: Rubro + Proveedor */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Rubro *</Label>
                <Select
                  value={form.rubro_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, rubro_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar rubro" />
                  </SelectTrigger>
                  <SelectContent>
                    {rubros.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Proveedor *</Label>
                <Select
                  value={form.proveedor_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, proveedor_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar proveedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {proveedores.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.razon_social}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 4: Unidad + Cantidad aviso */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Unidad de Medida *</Label>
                <Select
                  value={form.unidad_medida}
                  onValueChange={(v) => setForm((f) => ({ ...f, unidad_medida: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIDADES.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cantidad_aviso">Cantidad Aviso</Label>
                <Input
                  id="cantidad_aviso"
                  type="number"
                  min="0"
                  value={form.cantidad_aviso}
                  onChange={(e) => setForm((f) => ({ ...f, cantidad_aviso: e.target.value }))}
                  placeholder="0"
                />
              </div>
            </div>

            {/* Row 5: Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fecha_compra">Fecha Compra</Label>
                <Input
                  id="fecha_compra"
                  type="date"
                  value={form.fecha_compra}
                  onChange={(e) => setForm((f) => ({ ...f, fecha_compra: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fecha_vencimiento">Fecha Vencimiento</Label>
                <Input
                  id="fecha_vencimiento"
                  type="date"
                  value={form.fecha_vencimiento}
                  onChange={(e) => setForm((f) => ({ ...f, fecha_vencimiento: e.target.value }))}
                />
              </div>
            </div>

            {/* Row 6: Remesa */}
            <div className="space-y-2">
              <Label htmlFor="numero_remesa">Numero de Remesa</Label>
              <Input
                id="numero_remesa"
                value={form.numero_remesa}
                onChange={(e) => setForm((f) => ({ ...f, numero_remesa: e.target.value }))}
                placeholder="Numero de remesa (opcional)"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setFormOpen(false)}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={!isFormValid() || submitting}>
                {submitting ? 'Guardando...' : editing ? 'Guardar Cambios' : 'Crear Producto'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar Producto</DialogTitle>
            <DialogDescription>
              Estas seguro que queres eliminar el producto{' '}
              <span className="font-semibold text-foreground">{deleting?.nombre}</span>? Esta accion
              no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={submitting}
            >
              {submitting ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
