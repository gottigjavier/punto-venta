import { useEffect, useState, useCallback } from 'react';
import { usuariosApi } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Shield,
  UserCheck,
} from 'lucide-react';

interface Usuario {
  id: string;
  nombre_usuario: string;
  nik_usuario: string;
  email: string;
  telefono?: string | null;
  rol: 'admin' | 'gerente' | 'despachador';
  activo: boolean;
  created_at: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

type RolFilter = 'todos' | 'admin' | 'gerente' | 'despachador';
type ActivoFilter = 'todos' | 'activos' | 'inactivos';

const INITIAL_FORM = {
  nombre_usuario: '',
  nik_usuario: '',
  password: '',
  email: '',
  telefono: '',
  rol: 'despachador' as 'admin' | 'gerente' | 'despachador',
  activo: true,
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;

const ROL_LABELS: Record<string, string> = {
  admin: 'Admin',
  gerente: 'Gerente',
  despachador: 'Despachador',
};

function rolBadgeVariant(rol: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (rol) {
    case 'admin':
      return 'destructive';
    case 'gerente':
      return 'default';
    case 'despachador':
      return 'secondary';
    default:
      return 'outline';
  }
}

export function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [rolFilter, setRolFilter] = useState<RolFilter>('todos');
  const [activoFilter, setActivoFilter] = useState<ActivoFilter>('todos');
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  // Modal states
  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editing, setEditing] = useState<Usuario | null>(null);
  const [deleting, setDeleting] = useState<Usuario | null>(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchUsuarios = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {
        page,
        limit: pagination.limit,
        sort: 'created_at',
        order: 'desc',
      };
      if (search) params.search = search;
      if (rolFilter !== 'todos') params.rol = rolFilter;
      if (activoFilter !== 'todos') params.activo = activoFilter === 'activos';
      const { data } = await usuariosApi.list(params);
      setUsuarios(data.data as Usuario[]);
      if (data.pagination) {
        setPagination(data.pagination as Pagination);
      }
    } catch (e) {
      console.error('Error fetching usuarios:', e);
    } finally {
      setLoading(false);
    }
  }, [search, rolFilter, activoFilter, pagination.limit]);

  useEffect(() => {
    fetchUsuarios(1);
  }, [fetchUsuarios]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!form.nombre_usuario.trim()) {
      newErrors.nombre_usuario = 'El nombre de usuario es requerido';
    } else if (form.nombre_usuario.trim().length > 100) {
      newErrors.nombre_usuario = 'Maximo 100 caracteres';
    }

    if (!form.nik_usuario.trim()) {
      newErrors.nik_usuario = 'El nik de usuario es requerido';
    } else if (form.nik_usuario.trim().length > 50) {
      newErrors.nik_usuario = 'Maximo 50 caracteres';
    }

    if (!editing && !form.password) {
      newErrors.password = 'La contraseña es requerida';
    } else if (form.password && !PASSWORD_REGEX.test(form.password)) {
      newErrors.password =
        'Minimo 8 caracteres, 1 mayuscula, 1 numero y 1 caracter especial';
    }

    if (!form.email.trim()) {
      newErrors.email = 'El email es requerido';
    } else if (!EMAIL_REGEX.test(form.email.trim())) {
      newErrors.email = 'Email invalido';
    }

    if (form.telefono.trim() && form.telefono.trim().length > 20) {
      newErrors.telefono = 'Maximo 20 caracteres';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // -- Form handlers --
  const openCreate = () => {
    setEditing(null);
    setForm(INITIAL_FORM);
    setErrors({});
    setFormOpen(true);
  };

  const openEdit = (usuario: Usuario) => {
    setEditing(usuario);
    setForm({
      nombre_usuario: usuario.nombre_usuario,
      nik_usuario: usuario.nik_usuario,
      password: '',
      email: usuario.email,
      telefono: usuario.telefono ?? '',
      rol: usuario.rol,
      activo: usuario.activo,
    });
    setErrors({});
    setFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        nombre_usuario: form.nombre_usuario.trim(),
        nik_usuario: form.nik_usuario.trim(),
        email: form.email.trim(),
        rol: form.rol,
        activo: form.activo,
      };
      if (form.password) payload.password = form.password;
      if (form.telefono.trim()) payload.telefono = form.telefono.trim();

      if (editing) {
        await usuariosApi.update(editing.id, payload);
      } else {
        await usuariosApi.create(payload);
      }
      setFormOpen(false);
      fetchUsuarios(pagination.page);
    } catch (e) {
      console.error('Error saving usuario:', e);
    } finally {
      setSubmitting(false);
    }
  };

  // -- Delete handlers --
  const openDelete = (usuario: Usuario) => {
    setDeleting(usuario);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setSubmitting(true);
    try {
      await usuariosApi.delete(deleting.id);
      setDeleteOpen(false);
      setDeleting(null);
      fetchUsuarios(pagination.page);
    } catch (e) {
      console.error('Error deleting usuario:', e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Usuarios</h1>
          <p className="text-sm text-muted-foreground">Gestioná los usuarios del sistema</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Usuario
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, nik o email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={rolFilter}
                onValueChange={(v) => setRolFilter(v as RolFilter)}
              >
                <SelectTrigger className="w-[150px]">
                  <Shield className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue placeholder="Rol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los roles</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="gerente">Gerente</SelectItem>
                  <SelectItem value="despachador">Despachador</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={activoFilter}
                onValueChange={(v) => setActivoFilter(v as ActivoFilter)}
              >
                <SelectTrigger className="w-[140px]">
                  <UserCheck className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="activos">Activos</SelectItem>
                  <SelectItem value="inactivos">Inactivos</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="icon"
                onClick={() => fetchUsuarios(1)}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Cargando...
            </div>
          ) : usuarios.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Users className="mb-2 h-8 w-8" />
              <p>
                {search || rolFilter !== 'todos' || activoFilter !== 'todos'
                  ? 'No se encontraron usuarios'
                  : 'No hay usuarios todavia'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>NIK</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Telefono</TableHead>
                      <TableHead className="text-center">Rol</TableHead>
                      <TableHead className="text-center">Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usuarios.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">
                          {u.nombre_usuario}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {u.nik_usuario}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {u.email}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {u.telefono || '---'}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={rolBadgeVariant(u.rol)}>
                            {ROL_LABELS[u.rol] ?? u.rol}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={u.activo ? 'success' : 'secondary'}>
                            {u.activo ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEdit(u)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => openDelete(u)}
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
                      onClick={() => fetchUsuarios(pagination.page - 1)}
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
                      onClick={() => fetchUsuarios(pagination.page + 1)}
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
            <DialogTitle>{editing ? 'Editar Usuario' : 'Nuevo Usuario'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Modifica los datos del usuario. Deja la contraseña vacia para mantener la actual.'
                : 'Completá los datos para crear un usuario nuevo.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nombre_usuario">Nombre *</Label>
              <Input
                id="nombre_usuario"
                value={form.nombre_usuario}
                onChange={(e) => setForm((f) => ({ ...f, nombre_usuario: e.target.value }))}
                placeholder="Nombre completo"
                autoFocus
              />
              {errors.nombre_usuario && (
                <p className="text-sm text-destructive">{errors.nombre_usuario}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="nik_usuario">NIK *</Label>
              <Input
                id="nik_usuario"
                value={form.nik_usuario}
                onChange={(e) => setForm((f) => ({ ...f, nik_usuario: e.target.value }))}
                placeholder="Nombre de usuario para login"
              />
              {errors.nik_usuario && (
                <p className="text-sm text-destructive">{errors.nik_usuario}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">
                Contrasena {editing ? '(opcional)' : '*'}
              </Label>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder={editing ? 'Dejar vacio para mantener la actual' : 'Minimo 8 caracteres'}
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
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
              <Label htmlFor="telefono">Telefono</Label>
              <Input
                id="telefono"
                value={form.telefono}
                onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
                placeholder="Telefono opcional"
              />
              {errors.telefono && (
                <p className="text-sm text-destructive">{errors.telefono}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Rol *</Label>
              <Select
                value={form.rol}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, rol: v as 'admin' | 'gerente' | 'despachador' }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar rol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="gerente">Gerente</SelectItem>
                  <SelectItem value="despachador">Despachador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="activo"
                checked={form.activo}
                onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
                className="h-4 w-4 rounded border-input"
              />
              <Label htmlFor="activo" className="cursor-pointer">
                Activo
              </Label>
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
                disabled={
                  !form.nombre_usuario.trim() ||
                  !form.nik_usuario.trim() ||
                  !form.email.trim() ||
                  submitting
                }
              >
                {submitting
                  ? 'Guardando...'
                  : editing
                    ? 'Guardar Cambios'
                    : 'Crear Usuario'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desactivar Usuario</DialogTitle>
            <DialogDescription>
              Estas seguro que queres desactivar al usuario{' '}
              <span className="font-semibold text-foreground">
                {deleting?.nombre_usuario}
              </span>
              ? El usuario no podra iniciar sesion pero sus datos se conservan.
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
              {submitting ? 'Desactivando...' : 'Desactivar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
