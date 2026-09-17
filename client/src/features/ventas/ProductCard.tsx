import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { CartItem, ProductSearchResult } from "./types";
import { unitLabel } from "./cardWidth";

// ---------------------------------------------------------------------------
// Product card for the POS grid (rubro tabs + search results)
// ---------------------------------------------------------------------------
export function ProductCard({
  product,
  inCart,
  lastQty,
  ultimaCantidad,
  onAdd,
  disabled,
  saleConfirmed,
}: {
  product: ProductSearchResult;
  inCart?: CartItem | undefined;
  lastQty: number;
  ultimaCantidad: number | null;
  onAdd: () => void;
  disabled: boolean;
  saleConfirmed: boolean;
}) {
  return (
    <Card
      className={`cursor-pointer transition-colors hover:border-primary ${
        disabled ? "opacity-60" : ""
      }`}
      onClick={() => !disabled && onAdd()}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm whitespace-nowrap">
              {product.nombre}
            </p>
            <p className="text-xs text-muted-foreground font-mono">
              {product.codigo}
            </p>
            <p className="text-xs text-muted-foreground">
              Stock: {product.stock_actual} {unitLabel(product.unidad_medida)}
            </p>
            {ultimaCantidad != null && ultimaCantidad > 0 && (
              <p className="text-[10px] text-blue-600 dark:text-blue-400">
                Última venta: {ultimaCantidad}{" "}
                {unitLabel(product.unidad_medida)}
              </p>
            )}
            {lastQty !== 1 && (
              <p className="text-[10px] text-muted-foreground">
                Cant predeterminada: {lastQty}{" "}
                {unitLabel(product.unidad_medida)}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="font-bold text-sm">
              {formatCurrency(product.precio_venta)}
            </p>
            {!saleConfirmed && inCart ? (
              <Badge variant="default" className="mt-1 text-xs">
                En carrito: {inCart.cantidad}
              </Badge>
            ) : disabled ? (
              <Badge variant="destructive" className="mt-1 text-xs">
                Sin stock
              </Badge>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="mt-1 h-7"
                onClick={(e) => {
                  e.stopPropagation();
                  onAdd();
                }}
              >
                <Plus className="h-3 w-3 mr-1" />
                Agregar
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
