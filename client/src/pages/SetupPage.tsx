import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthContext";
import { authApi, setAccessToken } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Store, AlertCircle, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

// Página de setup inicial (SE1): se muestra cuando no existe ningún usuario y
// fuerza a crear la primera cuenta (rol admin). Nada más puede usarse hasta
// que haya un administrador.
interface FieldErrors {
  nombre_usuario?: string[];
  nik_usuario?: string[];
  email?: string[];
  password?: string[];
  telefono?: string[];
}

interface ApiErrorLike {
  response?: {
    data?: {
      error?: {
        message?: string;
        details?: Record<string, unknown>;
      };
    };
  };
}

function extractError(err: unknown): {
  message: string;
  fieldErrors?: FieldErrors;
} {
  const apiErr = err as ApiErrorLike;
  const msg = apiErr?.response?.data?.error?.message ?? "";
  const details = apiErr?.response?.data?.error?.details ?? undefined;
  return { message: msg, fieldErrors: details };
}

const passwordHelp =
  "Mínimo 8 caracteres, 1 mayúscula, 1 número y 1 carácter especial.";

export function SetupPage() {
  const [nombre, setNombre] = useState("");
  const [nik, setNik] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const { setUser } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setFieldErrors({});

    if (password !== confirm) {
      setError("Las contraseñas no coinciden");
      return;
    }

    setLoading(true);
    try {
      const { data } = await authApi.bootstrap({
        nombre_usuario: nombre.trim(),
        nik_usuario: nik.trim(),
        email: email.trim(),
        telefono: telefono.trim() || undefined,
        password,
      });
      const { accessToken: newAccessToken, user: createdUser } = data.data;
      setAccessToken(newAccessToken);
      setUser(createdUser);
      void navigate("/ventas", { replace: true });
    } catch (err: unknown) {
      const { message, fieldErrors: fe } = extractError(err);
      setFieldErrors(fe ?? {});
      setError(
        message ||
          "No se pudo crear la cuenta de administrador. Intentalo de nuevo.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-green-700 via-green-600 to-emerald-800 p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary">
            <Store className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold">Punto de Venta</CardTitle>
          <CardDescription>
            Primer acceso · configuración inicial
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-start gap-2 rounded-md bg-primary/10 p-3 text-sm text-primary">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              No hay ninguna cuenta creada todavía. Creá la cuenta de
              <strong> administrador</strong> para comenzar a usar el sistema.
              Esta pantalla solo aparece la primera vez.
            </span>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre de usuario</Label>
              <Input
                id="nombre"
                placeholder="Pepe García"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
                autoFocus
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nik">Nick de acceso</Label>
              <Input
                id="nik"
                placeholder="pepe"
                value={nik}
                onChange={(e) => setNik(e.target.value)}
                required
                disabled={loading}
              />
              {fieldErrors.nik_usuario && (
                <p className="text-xs text-destructive">
                  {fieldErrors.nik_usuario[0]}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="pepe@negocio.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
              {fieldErrors.email && (
                <p className="text-xs text-destructive">
                  {fieldErrors.email[0]}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="telefono">Teléfono (opcional)</Label>
              <Input
                id="telefono"
                placeholder="+54 9 11 1234 5678"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">{passwordHelp}</p>
              {fieldErrors.password && (
                <p className="text-xs text-destructive">
                  {fieldErrors.password[0]}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm">Confirmar contraseña</Label>
              <Input
                id="confirm"
                type="password"
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <Button
              type="submit"
              className={cn("w-full", loading && "opacity-70")}
              disabled={loading}
            >
              {loading ? "Creando cuenta…" : "Crear cuenta de administrador"}
            </Button>
          </form>
        </CardContent>
        <CardFooter>
          <p className="w-full text-center text-xs text-muted-foreground">
            El rol de esta cuenta es <strong>administrador</strong> y no se
            puede cambiar.
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
