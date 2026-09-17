import { useCallback, useState } from "react";
import { Calendar, DollarSign, ShoppingCart, Wallet } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/AuthContext";
import { HistorialView } from "@/features/ventas/HistorialView";
import { MovimientosView } from "@/features/ventas/MovimientosView";
import { POSView } from "@/features/ventas/POSView";
import { ResumenDiaView } from "@/features/ventas/ResumenDiaView";

// ---------------------------------------------------------------------------
// Main VentasPage
// ---------------------------------------------------------------------------

export function VentasPage() {
  const { user } = useAuth();
  const [historialRefreshKey, setHistorialRefreshKey] = useState(0);

  const handleCajaCerrada = useCallback(() => {
    setHistorialRefreshKey((k) => k + 1);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ventas</h1>
          <p className="text-sm text-muted-foreground">
            Terminal de venta y historial
          </p>
        </div>
      </div>

      <Tabs defaultValue="pos">
        <TabsList className="w-full justify-start flex-wrap h-auto gap-1">
          <TabsTrigger value="pos">
            <ShoppingCart className="mr-2 h-4 w-4" />
            Terminal POS
          </TabsTrigger>
          <TabsTrigger value="movimientos">
            <Wallet className="mr-2 h-4 w-4" />
            Ingresos/Egresos
          </TabsTrigger>
          {user?.rol !== "despachador" && (
            <TabsTrigger value="historial">
              <Calendar className="mr-2 h-4 w-4" />
              Historial
            </TabsTrigger>
          )}
          {user?.rol !== "despachador" && (
            <TabsTrigger value="resumen">
              <DollarSign className="mr-2 h-4 w-4" />
              Resumen del Periodo
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="pos">
          <POSView />
        </TabsContent>

        <TabsContent value="movimientos">
          <MovimientosView />
        </TabsContent>

        <TabsContent value="historial">
          <HistorialView
            currentUserRole={user?.rol}
            refreshKey={historialRefreshKey}
          />
        </TabsContent>

        <TabsContent value="resumen">
          <ResumenDiaView
            currentUserRole={user?.rol}
            onCajaCerrada={handleCajaCerrada}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}