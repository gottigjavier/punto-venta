import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  productosApi,
  rubrosApi,
  stockApi,
  ventasApi,
} from "@/lib/api-client";
import {
  countCartItems,
  onAddWhenConfirmed,
  onClearCart,
  onConfirmError,
  onConfirmSuccess,
  reconcileCartWithStock,
  shouldBlockConfirm,
} from "./cartMachine";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  Check,
  Minus,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type {
  CartItem,
  ProductSearchResult,
  Rubro,
  UltimaVenta,
  VentaWithDetails,
} from "./types";
import { computeMinCardWidth } from "./cardWidth";
import { ProductCard } from "./ProductCard";

// ---------------------------------------------------------------------------
// POS Terminal View
// ---------------------------------------------------------------------------
export function POSView() {
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartMode, setCartMode] = useState<"editing" | "confirmed">("editing");
  const [submitting, setSubmitting] = useState(false);
  const [saleResult, setSaleResult] = useState<{
    type: "success" | "error";
    message: string;
    details?: string;
  } | null>(null);

  // Rubro tabs state
  const [rubros, setRubros] = useState<Rubro[]>([]);
  const [productsByRubro, setProductsByRubro] = useState<
    Map<string, ProductSearchResult[]>
  >(new Map());
  const [allProducts, setAllProducts] = useState<ProductSearchResult[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [activeRubroTab, setActiveRubroTab] = useState("todos");

  // Last sale info per product (for addToCart quantity suggestion)
  const [ultimasVentasMap, setUltimasVentasMap] = useState<
    Map<string, UltimaVenta>
  >(new Map());

  // Track last used quantity per product
  const [lastQuantities, setLastQuantities] = useState<Map<string, number>>(
    new Map(),
  );

  // Dynamic min card width: uniformly sized to fit the widest product
  const minCardWidth = useMemo(
    () => computeMinCardWidth(allProducts, lastQuantities, ultimasVentasMap),
    [allProducts, lastQuantities, ultimasVentasMap],
  );

  // Focus search on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Track mounted state to avoid setState after unmount. Reset to true on every
  // mount (React StrictMode mounts->unmounts->remounts in dev, so the ref must
  // be re-armed on each mount, not just initialized once).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Load rubros + products + last-sold info. Extracted as useCallback so it can
  // be reused both on mount AND after a sale is confirmed (to refresh stock).
  // When `reconcileCart` is true it ALSO reconciles the cart lines against the
  // fresh stock (used after a failed sale due to STOCK_INSUFFICIENT).
  const loadRubrosAndProducts = useCallback(async (reconcileCart = false) => {
    setLoadingProducts(true);
    try {
      // Fetch rubros for tabs
      const { data: rubrosData } = await rubrosApi.list();
      const rubrosList = (rubrosData.data as Rubro[]) ?? [];

      if (!mountedRef.current) return;
      setRubros(rubrosList);

      // Fetch ALL products in one call (decoupled from rubro assignment)
      const { data: prodData } = await productosApi.list({ limit: 1000 });
      const products = (prodData.data as ProductSearchResult[]) ?? [];

      if (!mountedRef.current) return;

      // Fetch last-sold info per product (for addToCart quantity suggestion)
      let ultimasMap = new Map<string, UltimaVenta>();
      try {
        const { data: ultimasData } = await ventasApi.ultimasVentas();
        const ultimasList = (ultimasData.data as UltimaVenta[]) ?? [];
        ultimasMap = new Map(ultimasList.map((u) => [u.producto_id, u]));
      } catch {
        // non-fatal: quantity suggestion falls back to 1
      }

      if (!mountedRef.current) return;
      setUltimasVentasMap(ultimasMap);

      // Fetch total quantity sold per product (for grid ordering by most sold)
      let vendidosMap = new Map<
        string,
        { veces_vendido: number; monto_total: number }
      >();
      try {
        const { data: vendidosData } = await ventasApi.masVendidos();
        const vendidosList =
          (vendidosData.data as Array<{
            producto_id: string;
            veces_vendido: number;
            monto_total: number;
          }>) ?? [];
        vendidosMap = new Map(
          vendidosList.map((v) => [
            v.producto_id,
            { veces_vendido: v.veces_vendido, monto_total: v.monto_total },
          ]),
        );
      } catch {
        // non-fatal: sorting falls back to alphabetical
      }

      if (!mountedRef.current) return;

      // Sort: 3 groups — (1) sold + stock → most sold first,
      // (2) never-sold + stock → alphabetical, (3) no stock → last
      const sorted = [...products].sort((a, b) => {
        const ca = vendidosMap.get(a.id)?.veces_vendido ?? 0;
        const cb = vendidosMap.get(b.id)?.veces_vendido ?? 0;
        const hasStockA = a.stock_actual > 0;
        const hasStockB = b.stock_actual > 0;

        // Group 3: no stock → always last
        if (!hasStockA && hasStockB) return 1;
        if (hasStockA && !hasStockB) return -1;

        // Both have stock (groups 1 & 2)
        if (ca > 0 && cb > 0) return cb - ca; // both sold: most sold first
        if (ca > 0 && cb === 0) return -1; // a sold, b not → a first
        if (ca === 0 && cb > 0) return 1; // b sold, a not → b first
        return a.nombre.localeCompare(b.nombre); // both unsold → alphabetical
      });

      // Build per-rubro map from the full sorted list
      const byRubro = new Map<string, ProductSearchResult[]>();
      for (const rubro of rubrosList) {
        byRubro.set(
          rubro.id,
          sorted.filter((p) => p.rubro_id === rubro.id),
        );
      }

      setProductsByRubro(byRubro);
      setAllProducts(sorted);

      // After a stock-conflict error (another user closed a sale first, so the
      // stock this cart was built against moved), bring the cart back in line
      // with the current DB stock: update each line's stock_disponible and
      // clamp its cantidad.
      if (reconcileCart) {
        const freshStock = new Map(sorted.map((p) => [p.id, p.stock_actual]));
        setCart((prev) => reconcileCartWithStock(prev, freshStock));
      }
    } catch (err) {
      console.error("Error cargando productos del POS:", err);
    } finally {
      if (mountedRef.current) setLoadingProducts(false);
    }
  }, []);

  // Fetch rubros and products on mount
  useEffect(() => {
    void loadRubrosAndProducts();
  }, [loadRubrosAndProducts]);

  // Search products (min 3 chars)
  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    setSearchError("");

    if (query.length < 3) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const { data } = await stockApi.autocomplete(query, "nombre");
      setSearchResults((data.data as ProductSearchResult[]) ?? []);
    } catch {
      setSearchError("Error al buscar productos");
    } finally {
      setSearching(false);
    }
  }, []);

  // Add product to cart
  const addToCart = (product: ProductSearchResult, qtyOverride?: number) => {
    // Default quantity = last sold quantity (from backend /ultimas-ventas),
    // falling back to the remembered last-used qty, then 1.
    const ultimaCantidad = ultimasVentasMap.get(product.id)?.ultima_cantidad;
    const requestedQty =
      qtyOverride ??
      (ultimaCantidad != null && ultimaCantidad > 0
        ? ultimaCantidad
        : (lastQuantities.get(product.id) ?? 1));

    // If the requested (last-sold) quantity exceeds available stock, fall back
    // to the available stock so the product can still be loaded — but warn the
    // user. We only block hard when there is zero stock.
    let qty = requestedQty;
    let stockWarning: string | null = null;
    if (qty > product.stock_actual) {
      if (product.stock_actual <= 0) {
        setSaleResult({
          type: "error",
          message: `Stock insuficiente para ${product.nombre}. Disponible: ${product.stock_actual}`,
        });
        return;
      }
      qty = product.stock_actual;
      stockWarning = `Stock insuficiente para ${product.nombre}: se cargó el disponible (${product.stock_actual} ${product.unidad_medida}) en lugar de la última venta (${requestedQty} ${product.unidad_medida}).`;
    }

    // If cart is frozen after a confirmed sale, discard the previous cart and
    // start fresh with just this product. We use a direct setCart([...item])
    // instead of an updater function to avoid React batching pitfalls.
    if (cartMode === "confirmed") {
      setCart([
        {
          producto_id: product.id,
          nombre: product.nombre,
          codigo: product.codigo,
          precio_venta: product.precio_venta,
          cantidad: qty,
          stock_disponible: product.stock_actual,
          unidad_medida: product.unidad_medida,
        },
      ]);
      const next = onAddWhenConfirmed(stockWarning);
      setCartMode(next.cartMode);
      setSaleResult(next.saleResult);
      setSearchError("");
      setLastQuantities((prev) => new Map(prev).set(product.id, qty));
      return;
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.producto_id === product.id);
      if (existing) {
        const newQty = existing.cantidad + qty;
        if (newQty > product.stock_actual) {
          setSaleResult({
            type: "error",
            message: `Stock insuficiente para ${product.nombre}. Disponible: ${product.stock_actual}`,
          });
          return prev;
        }
        return prev.map((item) =>
          item.producto_id === product.id
            ? { ...item, cantidad: newQty }
            : item,
        );
      }
      return [
        ...prev,
        {
          producto_id: product.id,
          nombre: product.nombre,
          codigo: product.codigo,
          precio_venta: product.precio_venta,
          cantidad: qty,
          stock_disponible: product.stock_actual,
          unidad_medida: product.unidad_medida,
        },
      ];
    });
    setLastQuantities((prev) => new Map(prev).set(product.id, qty));
    if (stockWarning) {
      setSaleResult({ type: "error", message: stockWarning });
    } else {
      setSearchError("");
    }
  };

  // Update quantity
  const updateQuantity = (productoId: string, delta: number) => {
    setCart(
      (prev) =>
        prev
          .map((item) => {
            if (item.producto_id !== productoId) return item;
            const newQty = item.cantidad + delta;
            if (newQty <= 0) return null;
            if (newQty > item.stock_disponible) {
              setSaleResult({
                type: "error",
                message: `Stock insuficiente para ${item.nombre}. Disponible: ${item.stock_disponible}`,
              });
              return item;
            }
            setSearchError("");
            return { ...item, cantidad: newQty };
          })
          .filter(Boolean) as CartItem[],
    );
  };

  // Set quantity directly
  const setQuantity = (productoId: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((item) => item.producto_id !== productoId));
      return;
    }
    setCart((prev) =>
      prev.map((item) => {
        if (item.producto_id !== productoId) return item;
        if (qty > item.stock_disponible) {
          setSaleResult({
            type: "error",
            message: `Stock insuficiente para ${item.nombre}. Disponible: ${item.stock_disponible}`,
          });
          return { ...item, cantidad: item.stock_disponible };
        }
        setSearchError("");
        return { ...item, cantidad: qty };
      }),
    );
    setLastQuantities((prev) => new Map(prev).set(productoId, qty));
  };

  // Remove from cart
  const removeFromCart = (productoId: string) => {
    setCart((prev) => prev.filter((item) => item.producto_id !== productoId));
  };

  // Clear cart
  const clearCart = () => {
    setCart([]);
    const next = onClearCart();
    setCartMode(next.cartMode);
    setSaleResult(next.saleResult);
    setSearchError(next.searchError);
  };

  // Cart totals
  const cartTotal = cart.reduce(
    (sum, item) => sum + item.precio_venta * item.cantidad,
    0,
  );
  const cartItemCount = countCartItems(cart);

  // Confirm sale
  const confirmSale = async () => {
    if (cart.length === 0 || submitting) return;

    setSubmitting(true);
    setSaleResult(null);

    try {
      const payload = {
        // SE2: el server toma el precio de Producto.precio_venta (catálogo).
        // El payload ya no envía precio_unitario — el cliente no puede fijar
        // precios en una venta.
        productos: cart.map((item) => ({
          producto_id: item.producto_id,
          cantidad: item.cantidad,
        })),
      };

      const { data } = await ventasApi.create(payload);

      const venta = data.data as VentaWithDetails;
      const saleResultValue = {
        type: "success" as const,
        message: `Venta #${venta.id.slice(0, 8)} registrada correctamente`,
        details: `Total: ${formatCurrency(venta.total)} | ${cartItemCount} items`,
      };
      setSaleResult(saleResultValue);
      setCartMode(onConfirmSuccess(saleResultValue).cartMode);
      setSearchQuery("");
      setSearchResults([]);
      // Refresh product grid + stock so the UI reflects the deducted stock
      // without requiring a full page reload.
      void loadRubrosAndProducts();
      searchInputRef.current?.focus();
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: {
          data?: {
            error?: {
              code?: string;
              message?: string;
              disponible?: number;
              solicitado?: number;
            };
          };
        };
      };
      const errorData = axiosErr.response?.data?.error;
      let saleResultValue: { type: "error"; message: string; details?: string };
      if (errorData?.code === "STOCK_INSUFFICIENT") {
        saleResultValue = {
          type: "error",
          message: errorData.message ?? "Stock insuficiente",
          details: `Disponible: ${errorData.disponible} | Solicitado: ${errorData.solicitado}`,
        };
        // Otro usuario cerró una venta primero: el stock cambió de base.
        // Refrescá la grilla de productos (tarjetas con stock actual) y
        // reconciliá el carrito contra ese stock, para que el operador vea
        // cantidades reales antes de reintentar. Los resultados de búsqueda
        // activa también se refrescan.
        void loadRubrosAndProducts(true);
        if (searchQuery.length >= 3) {
          void handleSearch(searchQuery);
        }
      } else {
        saleResultValue = {
          type: "error",
          message: errorData?.message ?? "Error al procesar la venta",
        };
      }
      setSaleResult(saleResultValue);
      setCartMode(onConfirmError(saleResultValue).cartMode);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row gap-6">
      {/* Left: Search + Products */}
      <div className="flex-1 space-y-4 order-2 sm:order-1">
        {/* Search bar + Rubro selector: misma fila >=760px, apiladas <760px */}
        <div className="flex flex-col gap-3 min-[760px]:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder="Buscar producto (min. 3 caracteres)..."
              aria-label="Buscar producto"
              value={searchQuery}
              onChange={(e) => void handleSearch(e.target.value)}
              className="pl-9 text-lg h-12"
            />
            {searching && (
              <RefreshCw className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>

          {/* Rubro selector (hidden when search is active) */}
          {searchQuery.length < 3 && (
            <Select value={activeRubroTab} onValueChange={setActiveRubroTab}>
              <SelectTrigger className="w-full h-12 min-[760px]:w-52 min-[760px]:shrink-0">
                <SelectValue placeholder="Seleccionar rubro" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {rubros.map((rubro) => (
                  <SelectItem key={rubro.id} value={rubro.id}>
                    {rubro.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Search error */}
        {searchError && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{searchError}</span>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto h-6 w-6"
              onClick={() => setSearchError("")}
              aria-label="Cerrar"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Product grid (hidden when search is active) */}
        {searchQuery.length < 3 && (
          <div className="space-y-3">
            {loadingProducts ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Cargando productos...
              </div>
            ) : activeRubroTab === "todos" ? (
              <div
                className="grid gap-2"
                style={{
                  gridTemplateColumns: `repeat(auto-fill, minmax(${minCardWidth}px, 1fr))`,
                }}
              >
                {allProducts.map((product) => {
                  const inCart = cart.find(
                    (item) => item.producto_id === product.id,
                  );
                  const atStockLimit = inCart
                    ? inCart.cantidad >= product.stock_actual
                    : product.stock_actual <= 0;
                  const lastQty = lastQuantities.get(product.id) ?? 1;
                  const ultimaCantidad =
                    ultimasVentasMap.get(product.id)?.ultima_cantidad ?? null;

                  return (
                    <ProductCard
                      key={product.id}
                      product={product}
                      inCart={inCart}
                      lastQty={lastQty}
                      ultimaCantidad={ultimaCantidad}
                      disabled={atStockLimit}
                      saleConfirmed={cartMode === "confirmed"}
                      onAdd={() => addToCart(product)}
                    />
                  );
                })}
              </div>
            ) : (
              (() => {
                const products = productsByRubro.get(activeRubroTab) ?? [];
                if (products.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <Package className="mb-2 h-8 w-8" />
                      <p className="text-sm">No hay productos en este rubro</p>
                    </div>
                  );
                }
                return (
                  <div
                    className="grid gap-2"
                    style={{
                      gridTemplateColumns: `repeat(auto-fill, minmax(${minCardWidth}px, 1fr))`,
                    }}
                  >
                    {products.map((product) => {
                      const inCart = cart.find(
                        (item) => item.producto_id === product.id,
                      );
                      const atStockLimit = inCart
                        ? inCart.cantidad >= product.stock_actual
                        : product.stock_actual <= 0;
                      const lastQty = lastQuantities.get(product.id) ?? 1;
                      const ultimaCantidad =
                        ultimasVentasMap.get(product.id)?.ultima_cantidad ??
                        null;

                      return (
                        <ProductCard
                          key={product.id}
                          product={product}
                          inCart={inCart}
                          lastQty={lastQty}
                          ultimaCantidad={ultimaCantidad}
                          disabled={atStockLimit}
                          saleConfirmed={cartMode === "confirmed"}
                          onAdd={() => addToCart(product)}
                        />
                      );
                    })}
                  </div>
                );
              })()
            )}
          </div>
        )}

        {/* Product results */}
        {searchQuery.length >= 3 &&
          !searching &&
          searchResults.length === 0 &&
          !searchError && (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Package className="mb-2 h-8 w-8" />
              <p>No se encontraron productos</p>
            </div>
          )}

        {searchResults.length > 0 && (
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(${minCardWidth}px, 1fr))`,
            }}
          >
            {searchResults.map((product) => {
              const inCart = cart.find(
                (item) => item.producto_id === product.id,
              );
              const atStockLimit = inCart
                ? inCart.cantidad >= product.stock_actual
                : product.stock_actual <= 0;
              const lastQty = lastQuantities.get(product.id) ?? 1;
              const ultimaCantidad =
                ultimasVentasMap.get(product.id)?.ultima_cantidad ?? null;

              return (
                <ProductCard
                  key={product.id}
                  product={product}
                  inCart={inCart}
                  lastQty={lastQty}
                  ultimaCantidad={ultimaCantidad}
                  disabled={atStockLimit}
                  saleConfirmed={cartMode === "confirmed"}
                  onAdd={() => addToCart(product)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Right: Cart */}
      <div className="w-full sm:w-[320px] lg:w-[380px] shrink-0 order-1 sm:order-2">
        <Card className="sticky top-4">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="h-5 w-5" />
              Carrito
              {cart.length > 0 && (
                <Badge variant="secondary" className="ml-auto">
                  {cartItemCount} items
                </Badge>
              )}
              {cartMode === "confirmed" && (
                <Badge variant="outline" className="ml-1 text-xs">
                  Venta confirmada
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cart.length === 0 && cartMode === "editing" ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <ShoppingCart className="mb-2 h-8 w-8" />
                <p className="text-sm">Carrito vacio</p>
                <p className="text-xs">Busca un producto y agregalo</p>
              </div>
            ) : (
              <>
                {/* Cart items */}
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {cart.map((item) => (
                    <div
                      key={item.producto_id}
                      className="flex items-center gap-2 rounded-md border p-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {item.nombre}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency(item.precio_venta)} x {item.cantidad}
                        </p>
                      </div>

                      {/* Quantity controls */}
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => updateQuantity(item.producto_id, -1)}
                          disabled={cartMode === "confirmed"}
                          aria-label={`Reducir cantidad de ${item.nombre}`}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          type="number"
                          step="0.01"
                          value={item.cantidad}
                          aria-label={`Cantidad de ${item.nombre}`}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) setQuantity(item.producto_id, val);
                          }}
                          className="h-7 w-14 text-center text-xs px-1"
                          min={0.01}
                          max={item.stock_disponible}
                          disabled={cartMode === "confirmed"}
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => updateQuantity(item.producto_id, 1)}
                          disabled={
                            cartMode === "confirmed" ||
                            item.cantidad >= item.stock_disponible
                          }
                          aria-label={`Aumentar cantidad de ${item.nombre}`}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>

                      {/* Subtotal + remove */}
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-sm font-semibold w-20 text-right">
                          {formatCurrency(item.precio_venta * item.cantidad)}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => removeFromCart(item.producto_id)}
                          disabled={cartMode === "confirmed"}
                          aria-label={`Quitar ${item.nombre} del carrito`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Total */}
                <div className="mt-4 border-t pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Total</span>
                    <span className="text-xl font-bold">
                      {formatCurrency(cartTotal)}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={clearCart}
                    disabled={submitting}
                  >
                    Vaciar
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => void confirmSale()}
                    disabled={shouldBlockConfirm({
                      cartLength: cart.length,
                      cartMode,
                      submitting,
                      pendingError: saleResult?.type === "error",
                    })}
                  >
                    {submitting ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Procesando...
                      </>
                    ) : (
                      <>
                        <Check className="mr-2 h-4 w-4" />
                        Confirmar Venta
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
          {/* Sale result feedback */}
          {saleResult && (
            <CardFooter>
              <div
                className={`flex w-full items-center gap-2 rounded-md p-3 text-sm ${
                  saleResult.type === "success"
                    ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
                    : "bg-destructive/10 text-destructive"
                }`}
              >
                {saleResult.type === "success" ? (
                  <Check className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                )}
                <div className="flex-1">
                  <p className="font-medium">{saleResult.message}</p>
                  {saleResult.details && (
                    <p className="text-xs opacity-75">{saleResult.details}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setSaleResult(null)}
                  aria-label="Cerrar"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </CardFooter>
          )}
        </Card>
      </div>
    </div>
  );
}
