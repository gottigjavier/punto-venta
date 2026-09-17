import { useCallback, useEffect, useState } from "react";
import {
  movimientosApi,
  type MovimientoCajaItem,
  type ResumenMovimientos,
} from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Eye,
  Plus,
  RefreshCw,
  Wallet,
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

// ---------------------------------------------------------------------------
// Movimientos de Caja (Ingresos/Egresos) View
// ---------------------------------------------------------------------------
function formatDateTime(value: string): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-AR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MovimientosView() {
  const [movimientos, setMovimientos] = useState<MovimientoCajaItem[]>([]);
  const [resumen, setResumen] = useState<ResumenMovimientos>({
    ingresos: 0,
    egresos: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCrearModal, setShowCrearModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [detalleMovimiento, setDetalleMovimiento] =
    useState<MovimientoCajaItem | null>(null);

  // Form state
  const [tipo, setTipo] = useState<"ingreso" | "egreso">("ingreso");
  const [monto, setMonto] = useState("");
  const [descripcion, setDescripcion] = useState("");

  // Password state
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const fetchMovimientos = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await movimientosApi.list();
      setMovimientos(data.data);
      setResumen(data.resumen ?? { ingresos: 0, egresos: 0, total: 0 });
    } catch {
      setError("Error al cargar los movimientos de caja");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMovimientos();
  }, [fetchMovimientos]);

  const abrirConfirmacion = () => {
    const montoNum = parseFloat(monto);
    if (!monto.trim() || isNaN(montoNum) || montoNum <= 0) {
      setPasswordError("Ingresá un monto válido mayor a 0");
      return;
    }
    setPassword("");
    setPasswordError("");
    setShowCrearModal(false);
    setShowPasswordModal(true);
  };

  const cerrarPasswordModal = () => {
    setShowPasswordModal(false);
    setPassword("");
    setPasswordError("");
  };

  const confirmarMovimiento = async () => {
    if (!password.trim()) return;
    setEnviando(true);
    setPasswordError("");
    try {
      await movimientosApi.create({
        tipo,
        monto: parseFloat(monto),
        descripcion: descripcion.trim() || undefined,
        password,
      });
      cerrarPasswordModal();
      setMonto("");
      setDescripcion("");
      setTipo("ingreso");
      await fetchMovimientos();
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ??
        "Error al registrar el movimiento";
      setPasswordError(msg);
    } finally {
      setEnviando(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
        Cargando movimientos...
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
          onClick={() => void fetchMovimientos()}
        >
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">Ingresos y Egresos</h2>
        <Button
          variant="default"
          onClick={() => {
            setMonto("");
            setDescripcion("");
            setTipo("ingreso");
            setShowCrearModal(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Movimiento
        </Button>
      </div>

      {/* Resumen cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Ingresos</CardTitle>
            <ArrowDownCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(resumen.ingresos)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Egresos</CardTitle>
            <ArrowUpCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(resumen.egresos)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Diferencia</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${resumen.total >= 0 ? "text-green-600" : "text-red-600"}`}
            >
              {formatCurrency(resumen.total)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Listado de movimientos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Movimientos del periodo actual
          </CardTitle>
        </CardHeader>
        <CardContent>
          {movimientos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No hay movimientos registrados en este periodo
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha y hora</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead className="text-right">Egresos</TableHead>
                    <TableHead className="text-right">Ingresos</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movimientos.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>{formatDateTime(m.created_at)}</TableCell>
                      <TableCell>{m.usuario?.nombre_usuario ?? "—"}</TableCell>
                      <TableCell className="text-right text-red-600">
                        {m.tipo === "egreso" ? formatCurrency(m.monto) : ""}
                      </TableCell>
                      <TableCell className="text-right text-green-600">
                        {m.tipo === "ingreso" ? formatCurrency(m.monto) : ""}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDetalleMovimiento(m)}
                        >
                          <Eye className="mr-1 h-4 w-4" />
                          Ver detalles
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal crear movimiento */}
      <Dialog
        open={showCrearModal}
        onOpenChange={(open) => !open && setShowCrearModal(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Movimiento</DialogTitle>
            <DialogDescription>
              Seleccioná el tipo y el monto del movimiento de caja.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={tipo === "ingreso" ? "default" : "outline"}
                  onClick={() => setTipo("ingreso")}
                  className={
                    tipo === "ingreso" ? "bg-green-600 hover:bg-green-700" : ""
                  }
                >
                  <ArrowDownCircle className="mr-2 h-4 w-4" />
                  Ingreso
                </Button>
                <Button
                  type="button"
                  variant={tipo === "egreso" ? "default" : "outline"}
                  onClick={() => setTipo("egreso")}
                  className={
                    tipo === "egreso" ? "bg-red-600 hover:bg-red-700" : ""
                  }
                >
                  <ArrowUpCircle className="mr-2 h-4 w-4" />
                  Egreso
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="monto-mov">Monto</Label>
              <Input
                id="monto-mov"
                type="number"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0.00"
                min="0.01"
                step="0.01"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc-mov">Descripción (opcional)</Label>
              <Input
                id="desc-mov"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Ej: Pago a proveedor, ingreso por caja chica..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCrearModal(false)}>
              Cancelar
            </Button>
            <Button onClick={abrirConfirmacion}>Enviar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal confirmar password */}
      <Dialog
        open={showPasswordModal}
        onOpenChange={(open) => !open && cerrarPasswordModal()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar movimiento</DialogTitle>
            <DialogDescription>
              Vas a registrar un <strong>{tipo}</strong> de{" "}
              <strong>{formatCurrency(parseFloat(monto) || 0)}</strong>
              {descripcion.trim() ? ` — ${descripcion.trim()}` : ""}. Ingresá tu
              contraseña para confirmar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password-mov">Contraseña</Label>
              <Input
                id="password-mov"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tu contraseña"
                disabled={enviando}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && password.trim() && !enviando) {
                    void confirmarMovimiento();
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
              onClick={cerrarPasswordModal}
              disabled={enviando}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void confirmarMovimiento()}
              disabled={!password.trim() || enviando}
            >
              {enviando ? "Registrando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal detalles */}
      <Dialog
        open={detalleMovimiento !== null}
        onOpenChange={(open) => !open && setDetalleMovimiento(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {detalleMovimiento?.tipo === "ingreso"
                ? "Detalle de Ingreso"
                : "Detalle de Egreso"}
            </DialogTitle>
          </DialogHeader>
          {detalleMovimiento && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Tipo</span>
                <span
                  className={`font-semibold ${
                    detalleMovimiento.tipo === "ingreso"
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {detalleMovimiento.tipo === "ingreso" ? "Ingreso" : "Egreso"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Monto</span>
                <span
                  className={`text-lg font-bold ${
                    detalleMovimiento.tipo === "ingreso"
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {formatCurrency(detalleMovimiento.monto)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Usuario</span>
                <span className="font-medium">
                  {detalleMovimiento.usuario?.nombre_usuario ?? "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Fecha y hora
                </span>
                <span className="font-medium">
                  {formatDateTime(detalleMovimiento.created_at)}
                </span>
              </div>
              {detalleMovimiento.descripcion && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Descripción
                  </span>
                  <span className="font-medium text-right">
                    {detalleMovimiento.descripcion}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">ID</span>
                <span className="font-mono text-xs">
                  {detalleMovimiento.id}
                </span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setDetalleMovimiento(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
