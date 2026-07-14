import { useEffect, useState, useCallback } from 'react';
import { proveedoresApi } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Truck, Plus, Pencil, Trash2, Search, RefreshCw, ChevronLeft, ChevronRight, X } from 'lucide-react';

interface Proveedor {
  id: string;
  razon_social: string;
  representante?: string | null;
  cuit?: string | null;
  direccion_postal?: string | null;
  email?: string | null;
  telefonos?: string[] | null;
  created_at: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const INITIAL_FORM = {
  razon_social: '',
  representante: '',
  cuit: '',
  direccion_postal: '',
  email: '',
  telefonos: [] as string[],
};

const CUIT_REGEX = /^\d{2}-\d{8}-\d{1}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatCuit(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 10) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10, 11)}`;
}

export function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  // Modal states
  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editing, setEditing] = useState<Proveedor | null>(null);
  const [deleting, setDeleting] = useState<Proveedor | null>(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [newTelefono, setNewTelefono] = useState('');

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchProveedores = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {
        page,
        limit: pagination.limit,
        sort: 'razon_social',
        order: 'asc',
      };
      if (search) params.search = search;
      const { data } = await proveedoresApi.list(params);
      setProveedores(data.data as Proveedor[]);
      if (data.pagination) {
        setPagination(data.pagination as Pagination);
      }
    } catch (e) {
      console.error('Error fetching proveedores:', e);
    } finally {
      setLoading(false);
    }
  }, [search, pagination.limit]);

  useEffect(() => {
    fetchProveedores(1);
  }, [fetchProveedores]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!form.razon_social.trim()) {
      newErrors.razon_social = 'La razon social es requerida';
    } else if (form.razon_social.trim().length > 200) {
      newErrors.razon_social = 'Maximo 200 caracteres';
    }

    if (form.representante.trim() && form.representante.trim().length > 150) {
      newErrors.representante = 'Maximo 150 caracteres';
    }

    if (form.cuit.trim() && !CUIT_REGEX.test(form.cuit.trim())) {
      newErrors.cuit = 'CUIT invalido. Formato: XX-XXXXXXXX-X';
    }

    if (form.email.trim() && !EMAIL_REGEX.test(form.email.trim())) {
      newErrors.email = 'Email invalido';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // -- Form handlers --
  const openCreate = () => {
    setEditing(null);
    setForm(INITIAL_FORM);
    setErrors({});
    setNewTelefono('');
    setFormOpen(true);
  };

  const openEdit = (proveedor: Proveedor) => {
    setEditing(proveedor);
    setForm({
      razon_social: proveedor.razon_social,
      representante: proveedor.representante ?? '',
      cuit: proveedor.cuit ?? '',
      direccion_postal: proveedor.direccion_postal ?? '',
      email: proveedor.email ?? '',
      telefonos: proveedor.telefonos ?? [],
    });
    setErrors({});
    setNewTelefono('');
    setFormOpen(true);
  };

  const addTelefono = () => {
    const trimmed = newTelefono.trim();
    if (trimmed && !form.telefonos.includes(trimmed)) {
      setForm((f) => ({ ...f, telefonos: [...f.telefonos, trimmed] }));
      setNewTelefono('');
    }
  };

  const removeTelefono = (tel: string) => {
    setForm((f) => ({ ...f, telefonos: f.telefonos.filter((t) => t !== tel) }));
  };

  const handleTelefonoKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTelefono();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        razon_social: form.razon_social.trim(),
      };
      if (form.representante.trim()) payload.representante = form.representante.trim();
      if (form.cuit.trim()) payload.cuit = form.cuit.trim();
      if (form.direccion_postal.trim()) payload.direccion_postal = form.direccion_postal.trim();
      if (form.email.trim()) payload.email = form.email.trim();
      if (form.telefonos.length > 0) payload.telefonos = form.telefonos;

      if (editing) {
        await proveedoresApi.update(editing.id, payload);
      } else {
        await proveedoresApi.create(payload);
      }
      setFormOpen(false);
      fetchProveedores(pagination.page);
    } catch (e) {
      console.error('Error saving proveedor:', e);
    } finally {
      setSubmitting(false);
    }
  };

  // -- Delete handlers --
  const openDelete = (proveedor: Proveedor) => {
    setDeleting(proveedor);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setSubmitting(true);
    try {
      await proveedoresApi.delete(deleting.id);
      setDeleteOpen(false);
      setDeleting(null);
      fetchProveedores(pagination.page);
    } catch (e) {
      console.error('Error deleting proveedor:', e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Proveedores</h1>
          <p className="text-sm text-muted-foreground">Gestioná los proveedores del negocio</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Proveedor
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por razon social o CUIT..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button variant="outline" size="icon" onClick={() => fetchProveedores(1)}>
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
          ) : proveedores.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Truck className="mb-2 h-8 w-8" />
              <p>{search ? 'No se encontraron proveedores' : 'No hay proveedores todavia'}</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Razon Social</TableHead>
                      <TableHead>Representante</TableHead>
                      <TableHead>CUIT</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Telefonos</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {proveedores.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.razon_social}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {p.representante || '---'}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{p.cuit || '---'}</TableCell>
                        <TableCell className="text-muted-foreground">{p.email || '---'}</TableCell>
                        <TableCell>
                          {p.telefonos && p.telefonos.length > 0
                            ? p.telefonos.join(', ')
                            : '---'}
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
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-sm text-muted-foreground">
                    Mostrando {(pagination.page - 1) * pagination.limit + 1} a{' '}
                    {Math.min(pagination.page * pagination.limit, pagination.total)} de{' '}
                    {pagination.total}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagination.page <= 1}
                      onClick={() => fetchProveedores(pagination.page - 1)}
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
                      onClick={() => fetchProveedores(pagination.page + 1)}
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

      {/* Create / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Proveedor' : 'Nuevo Proveedor'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Modifica los datos del proveedor.'
                : 'Completá los datos para crear un proveedor nuevo.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="razon_social">Razon Social *</Label>
              <Input
                id="razon_social"
                value={form.razon_social}
                onChange={(e) => setForm((f) => ({ ...f, razon_social: e.target.value }))}
                placeholder="Nombre o razon social"
                autoFocus
              />
              {errors.razon_social && (
                <p className="text-sm text-destructive">{errors.razon_social}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="representante">Representante</Label>
              <Input
                id="representante"
                value={form.representante}
                onChange={(e) => setForm((f) => ({ ...f, representante: e.target.value }))}
                placeholder="Nombre del representante"
              />
              {errors.representante && (
                <p className="text-sm text-destructive">{errors.representante}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cuit">CUIT</Label>
              <Input
                id="cuit"
                value={form.cuit}
                onChange={(e) =>
                  setForm((f) => ({ ...f, cuit: formatCuit(e.target.value) }))
                }
                placeholder="XX-XXXXXXXX-X"
                maxLength={13}
              />
              {errors.cuit && (
                <p className="text-sm text-destructive">{errors.cuit}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="direccion_postal">Direccion Postal</Label>
              <Input
                id="direccion_postal"
                value={form.direccion_postal}
                onChange={(e) => setForm((f) => ({ ...f, direccion_postal: e.target.value }))}
                placeholder="Direccion postal"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="correo@ejemplo.com"
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Telefonos</Label>
              <div className="flex gap-2">
                <Input
                  value={newTelefono}
                  onChange={(e) => setNewTelefono(e.target.value)}
                  onKeyDown={handleTelefonoKeyDown}
                  placeholder="Agregar telefono y presionar Enter"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={addTelefono}
                  disabled={!newTelefono.trim()}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {form.telefonos.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {form.telefonos.map((tel) => (
                    <span
                      key={tel}
                      className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs"
                    >
                      {tel}
                      <button
                        type="button"
                        onClick={() => removeTelefono(tel)}
                        className="ml-0.5 text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
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
              <Button
                type="submit"
                disabled={!form.razon_social.trim() || submitting}
              >
                {submitting ? 'Guardando...' : editing ? 'Guardar Cambios' : 'Crear Proveedor'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar Proveedor</DialogTitle>
            <DialogDescription>
              Estas seguro que queres eliminar el proveedor{' '}
              <span className="font-semibold text-foreground">{deleting?.razon_social}</span>? Esta
              accion no se puede deshacer.
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
