import { useCallback, useEffect, useState } from "react";
import { ventasApi } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Calendar,
  DollarSign,
  RefreshCw,
  ShoppingCart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ResumenDia } from "./types";

// ---------------------------------------------------------------------------
// Resumen del Dia View
// ---------------------------------------------------------------------------
export function ResumenDiaView({
  currentUserRole,
  onCajaCerrada,
}: {
  currentUserRole?: string;
  onCajaCerrada?: () => void;
}) {
  const [resumen, setResumen] = useState<ResumenDia | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cerrando, setCerrando] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const canCerrarCaja = ["admin", "gerente"].includes(currentUserRole ?? "");

  const fetchResumen = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await ventasApi.resumenDia();
      setResumen(data.data as ResumenDia);
    } catch {
      setError("Error al cargar el resumen del dia");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCerrarCaja = async () => {
    if (!password.trim()) return;
    setCerrando(true);
    setPasswordError("");
    try {
      await ventasApi.cerrarCaja({ password });
      setShowPasswordModal(false);
      setPassword("");
      setPasswordError("");
      await fetchResumen();
      onCajaCerrada?.();
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ?? "Error al cerrar la caja";
      setPasswordError(msg);
    } finally {
      setCerrando(false);
    }
  };

  const openPasswordModal = () => {
    setPassword("");
    setPasswordError("");
    setShowPasswordModal(true);
  };

  const closePasswordModal = () => {
    setShowPasswordModal(false);
    setPassword("");
    setPasswordError("");
  };

  useEffect(() => {
    void fetchResumen();
  }, [fetchResumen]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
        Cargando resumen...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <AlertTriangle className="mb-2 h-8 w-8 text-destructive" />
        <p className="text-destructive">{error}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => void fetchResumen()}
        >
          Reintentar
        </Button>
      </div>
    );
  }

  if (!resumen) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">
          Resumen del Periodo
        </h2>
        {canCerrarCaja && (
          <Button
            variant="default"
            onClick={openPasswordModal}
            disabled={cerrando}
          >
            Cierre de Caja
          </Button>
        )}
      </div>
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Inicio del Periodo Actual
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{resumen.fecha}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Ventas</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{resumen.total_ventas}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Monto Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(resumen.monto_total)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ingresos y Egresos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ingresos y Egresos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground flex items-center">
                <ArrowDownCircle className="mr-2 h-4 w-4 text-green-600" />
                Ingresos
              </span>
              <span className="text-lg font-bold text-green-600">
                {formatCurrency(resumen.ingresos_total ?? 0)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground flex items-center">
                <ArrowUpCircle className="mr-2 h-4 w-4 text-red-600" />
                Egresos
              </span>
              <span className="text-lg font-bold text-red-600">
                {formatCurrency(resumen.egresos_total ?? 0)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ventas por vendedor */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ventas por Vendedor</CardTitle>
        </CardHeader>
        <CardContent>
          {resumen.ventas_por_usuario.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No hay ventas registradas hoy
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendedor</TableHead>
                    <TableHead className="text-center">Cant. Ventas</TableHead>
                    <TableHead className="text-right">Monto Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resumen.ventas_por_usuario.map((v) => (
                    <TableRow key={v.usuario_id}>
                      <TableCell className="font-medium">{v.nombre}</TableCell>
                      <TableCell className="text-center">
                        {v.cantidad_ventas}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(v.monto_total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Productos vendidos */}
      {resumen.productos_vendidos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Productos Vendidos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Cant. Vendida</TableHead>
                    <TableHead className="text-right">Monto Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resumen.productos_vendidos.map((p) => (
                    <TableRow key={p.producto_id}>
                      <TableCell className="font-medium">{p.nombre}</TableCell>
                      <TableCell className="text-right">
                        {p.cantidad_total}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(p.monto_total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Password modal para cierre de caja */}
      <Dialog
        open={showPasswordModal}
        onOpenChange={(open) => !open && closePasswordModal()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar cierre de caja</DialogTitle>
            <DialogDescription>
              Ingresá tu contraseña para confirmar el cierre. Se archivarán las
              ventas del período actual.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password-cierre">Contraseña</Label>
              <Input
                id="password-cierre"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tu contraseña"
                disabled={cerrando}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && password.trim() && !cerrando) {
                    void handleCerrarCaja();
                  }
                }}
              />
            </div>
            {passwordError && (
              <p className="text-sm text-destructive">{passwordError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={closePasswordModal}
              disabled={cerrando}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void handleCerrarCaja()}
              disabled={!password.trim() || cerrando}
            >
              {cerrando ? "Cerrando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
