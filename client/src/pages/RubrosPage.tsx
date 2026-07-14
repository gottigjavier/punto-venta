import { useEffect, useState, useCallback } from 'react';
import { rubrosApi } from '@/lib/api-client';
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
import { Tags, Plus, Pencil, Trash2, Search, RefreshCw } from 'lucide-react';

interface Rubro {
  id: string;
  nombre: string;
  descripcion?: string;
  activo: boolean;
}

const INITIAL_FORM = { nombre: '', descripcion: '' };

export function RubrosPage() {
  const [rubros, setRubros] = useState<Rubro[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modal states
  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editing, setEditing] = useState<Rubro | null>(null);
  const [deleting, setDeleting] = useState<Rubro | null>(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);

  const fetchRubros = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await rubrosApi.list();
      setRubros(data.data as Rubro[]);
    } catch (e) {
      console.error('Error fetching rubros:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRubros();
  }, [fetchRubros]);

  const filtered = rubros.filter((r) =>
    r.nombre.toLowerCase().includes(search.toLowerCase()),
  );

  // -- Form handlers --
  const openCreate = () => {
    setEditing(null);
    setForm(INITIAL_FORM);
    setFormOpen(true);
  };

  const openEdit = (rubro: Rubro) => {
    setEditing(rubro);
    setForm({ nombre: rubro.nombre, descripcion: rubro.descripcion ?? '' });
    setFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) return;
    setSubmitting(true);
    try {
      const payload = {
        nombre: form.nombre.trim(),
        ...(form.descripcion.trim() ? { descripcion: form.descripcion.trim() } : {}),
      };
      if (editing) {
        await rubrosApi.update(editing.id, payload);
      } else {
        await rubrosApi.create(payload);
      }
      setFormOpen(false);
      fetchRubros();
    } catch (e) {
      console.error('Error saving rubro:', e);
    } finally {
      setSubmitting(false);
    }
  };

  // -- Delete handlers --
  const openDelete = (rubro: Rubro) => {
    setDeleting(rubro);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setSubmitting(true);
    try {
      await rubrosApi.delete(deleting.id);
      setDeleteOpen(false);
      setDeleting(null);
      fetchRubros();
    } catch (e) {
      console.error('Error deleting rubro:', e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Rubros</h1>
          <p className="text-sm text-muted-foreground">Gestioná las categorias de productos</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Rubro
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar rubros..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button variant="outline" size="icon" onClick={fetchRubros}>
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
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Tags className="mb-2 h-8 w-8" />
              <p>{search ? 'No se encontraron rubros' : 'No hay rubros todavia'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Descripcion</TableHead>
                    <TableHead className="text-center">Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.nombre}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.descripcion || '---'}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={r.activo ? 'success' : 'secondary'}>
                          {r.activo ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(r)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => openDelete(r)}
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
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Rubro' : 'Nuevo Rubro'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Modifica los datos del rubro.'
                : 'Completá los datos para crear un rubro nuevo.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre *</Label>
              <Input
                id="nombre"
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                placeholder="Nombre del rubro"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="descripcion">Descripcion</Label>
              <Input
                id="descripcion"
                value={form.descripcion}
                onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                placeholder="Descripcion opcional"
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
              <Button type="submit" disabled={!form.nombre.trim() || submitting}>
                {submitting ? 'Guardando...' : editing ? 'Guardar Cambios' : 'Crear Rubro'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar Rubro</DialogTitle>
            <DialogDescription>
              Estas seguro que queres eliminar el rubro{' '}
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
