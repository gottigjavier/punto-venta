import { useCallback, useEffect, useState } from "react";
import {
  usuariosApi,
  ventasApi,
  type FilaHistorial,
  type HistorialQueryParams,
} from "@/lib/api-client";
import { formatCurrency, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  RefreshCw,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import type { Pagination, Usuario, VentaWithDetails } from "./types";

// ---------------------------------------------------------------------------
// Historial View
// ---------------------------------------------------------------------------
function estadoBadge(estado: string) {
  switch (estado) {
    case "completada":
      return <Badge variant="success">Completada</Badge>;
    case "pendiente":
      return <Badge variant="outline">Pendiente</Badge>;
    case "cancelada":
      return <Badge variant="destructive">Cancelada</Badge>;
    default:
      return <Badge variant="secondary">{estado}</Badge>;
  }
}

// Badge for the unified history row type (Venta / Ingreso / Egreso)
function estadoBadgeHistorial(estado: "Venta" | "Ingreso" | "Egreso") {
  switch (estado) {
    case "Venta":
      return <Badge variant="default">Venta</Badge>;
    case "Ingreso":
      return <Badge variant="success">Ingreso</Badge>;
    case "Egreso":
      return <Badge variant="destructive">Egreso</Badge>;
    default:
      return <Badge variant="secondary">{estado}</Badge>;
  }
}

export function HistorialView({
  currentUserRole,
  refreshKey,
}: {
  currentUserRole?: string;
  refreshKey?: number;
}) {
  const canDeleteVentas = ["admin", "gerente"].includes(currentUserRole ?? "");
  const [filas, setFilas] = useState<FilaHistorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  // Filters
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [tipoFilaFilter, setTipoFilaFilter] = useState<string>("");
  const [usuarioFilter, setUsuarioFilter] = useState("");
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);

  // Detail dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailVenta, setDetailVenta] = useState<VentaWithDetails | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Load users for filter
  useEffect(() => {
    usuariosApi
      .list({ limit: 100 })
      .then(({ data }) => {
        setUsuarios((data.data as Usuario[]) ?? []);
      })
      .catch(() => {});
  }, []);

  const fetchHistorial = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const params: HistorialQueryParams = {
          page,
          limit: pagination.limit,
          sort: "created_at",
          order: "desc",
        };
        if (fechaDesde) params.fecha_desde = fechaDesde;
        if (fechaHasta) params.fecha_hasta = fechaHasta;
        if (tipoFilaFilter)
          params.tipo_fila = tipoFilaFilter as "venta" | "movimiento";
        if (usuarioFilter) params.usuario_id = usuarioFilter;

        const { data } = await ventasApi.historial(params);
        setFilas(data.data ?? []);
        if (data.pagination) {
          setPagination(data.pagination);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    },
    [pagination.limit, fechaDesde, fechaHasta, tipoFilaFilter, usuarioFilter],
  );

  useEffect(() => {
    void fetchHistorial(1);
  }, [fetchHistorial]);

  // Refetch when parent signals a cash period was closed
  useEffect(() => {
    if (refreshKey && refreshKey > 0) {
      setPagination((p) => ({ ...p, page: 1 }));
      void fetchHistorial(1);
    }
  }, [refreshKey, fetchHistorial]);

  // View sale details
  const viewDetails = async (ventaId: string) => {
    setDetailLoading(true);
    setDetailOpen(true);
    try {
      const { data } = await ventasApi.getById(ventaId);
      setDetailVenta(data.data as VentaWithDetails);
    } catch {
      setDetailVenta(null);
    } finally {
      setDetailLoading(false);
    }
  };

  // Reset filters
  const resetFilters = () => {
    setFechaDesde("");
    setFechaHasta("");
    setTipoFilaFilter("");
    setUsuarioFilter("");
  };

  // Delete a completed sale (admin/gerente only)
  const handleDelete = async (ventaId: string) => {
    if (
      !window.confirm(
        "¿Eliminar esta venta? El stock se restituirá automáticamente.",
      )
    ) {
      return;
    }
    try {
      await ventasApi.delete(ventaId);
      setDetailOpen(false);
      void fetchHistorial(1);
      alert("Venta eliminada. El stock fue restituido.");
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { status?: number; data?: { error?: { message?: string } } };
      };
      const status = axiosErr?.response?.status;
      const msg =
        axiosErr?.response?.data?.error?.message ??
        "Error al eliminar la venta";
      if (status === 409) {
        window.alert(`No se puede eliminar: ${msg}`);
      } else {
        window.alert(msg);
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-end gap-3">
            <Badge variant="secondary" className="mb-1">
              Período activo
            </Badge>
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
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <Select
                value={tipoFilaFilter}
                onValueChange={(v) => setTipoFilaFilter(v === "all" ? "" : v)}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="venta">Ventas</SelectItem>
                  <SelectItem value="movimiento">Movimientos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vendedor</Label>
              <Select
                value={usuarioFilter}
                onValueChange={(v) => setUsuarioFilter(v === "all" ? "" : v)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {usuarios.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nombre_usuario}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              Cargando...
            </div>
          ) : filas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <ShoppingCart className="mb-2 h-8 w-8" />
              <p>No hay registros en el historial del período activo</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead className="text-center">Items</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-center">Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filas.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell className="text-sm">
                          {formatDate(f.created_at)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {f.usuario_nombre}
                        </TableCell>
                        <TableCell className="text-center">
                          {f.tipo_fila === "venta" ? f.cantidad_items : "—"}
                        </TableCell>
                        <TableCell
                          className={
                            f.estado === "Egreso"
                              ? "text-right font-semibold text-red-600"
                              : "text-right font-semibold"
                          }
                        >
                          {f.estado === "Egreso"
                            ? `-${formatCurrency(f.monto)}`
                            : formatCurrency(f.monto)}
                        </TableCell>
                        <TableCell className="text-center">
                          {estadoBadgeHistorial(f.estado)}
                        </TableCell>
                        <TableCell className="text-right">
                          {f.tipo_fila === "venta" ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => void viewDetails(f.id)}
                              aria-label={`Ver detalle de la venta del ${formatDate(f.created_at)}`}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
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
                    Mostrando {(pagination.page - 1) * pagination.limit + 1} -{" "}
                    {Math.min(
                      pagination.page * pagination.limit,
                      pagination.total,
                    )}{" "}
                    de {pagination.total}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagination.page <= 1}
                      onClick={() => void fetchHistorial(pagination.page - 1)}
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
                      onClick={() => void fetchHistorial(pagination.page + 1)}
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

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle de Venta</DialogTitle>
            <DialogDescription>
              {detailVenta
                ? `Venta #${detailVenta.id.slice(0, 8)} - ${formatDate(detailVenta.created_at)}`
                : "Cargando..."}
            </DialogDescription>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Cargando...
            </div>
          ) : detailVenta ? (
            <div className="space-y-4">
              {/* Sale info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Vendedor</p>
                  <p className="font-medium">
                    {detailVenta.usuario?.nombre_usuario ?? "---"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Estado</p>
                  <div>{estadoBadge(detailVenta.estado)}</div>
                </div>
                <div>
                  <p className="text-muted-foreground">Fecha</p>
                  <p className="font-medium">
                    {formatDate(detailVenta.created_at)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total</p>
                  <p className="font-bold text-lg">
                    {formatCurrency(detailVenta.total)}
                  </p>
                </div>
              </div>

              {/* Items table */}
              <div>
                <h4 className="text-sm font-medium mb-2">Productos</h4>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead className="text-right">Precio</TableHead>
                        <TableHead className="text-right">Cant.</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailVenta.detalles_venta.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="text-sm">
                            <span className="font-medium">
                              {d.producto?.nombre ?? "---"}
                            </span>
                            <span className="ml-1 text-xs text-muted-foreground font-mono">
                              {d.producto?.codigo ?? ""}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {formatCurrency(d.precio_unitario)}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {d.cantidad}
                          </TableCell>
                          <TableCell className="text-right text-sm font-semibold">
                            {formatCurrency(d.subtotal)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Delete action (admin/gerente only, completed sales) */}
              {canDeleteVentas && detailVenta?.estado === "completada" && (
                <div className="pt-2 border-t">
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => void handleDelete(detailVenta.id)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Eliminar venta
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No se pudo cargar el detalle
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
