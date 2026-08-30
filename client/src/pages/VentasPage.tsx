import { useState, useCallback, useEffect, useRef } from 'react';
import {
  stockApi,
  ventasApi,
  usuariosApi,
  rubrosApi,
  productosApi,
  movimientosApi,
  type MovimientoCajaItem,
  type ResumenMovimientos,
  type FilaHistorial,
  type HistorialQueryParams,
} from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { onConfirmSuccess, onConfirmError, onClearCart, onAddWhenConfirmed, countCartItems } from '@/features/ventas/cartMachine';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ShoppingCart,
  Search,
  Plus,
  Minus,
  Trash2,
  Check,
  AlertTriangle,
  RefreshCw,
  Eye,
  Calendar,
  DollarSign,
  Package,
  ChevronLeft,
  ChevronRight,
  X,
  ArrowDownCircle,
  ArrowUpCircle,
  Wallet,
} from 'lucide-react';
import { useAuth } from '@/features/auth/AuthContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Rubro {
  id: string;
  nombre: string;
  activo: boolean;
}

interface ProductSearchResult {
  id: string;
  nombre: string;
  codigo: string;
  stock_actual: number;
  precio_venta: number;
  unidad_medida: string;
  rubro_id?: string;
  rubro?: { id: string; nombre: string };
  proveedor?: { id: string; razon_social: string };
}

interface UltimaVenta {
  producto_id: string;
  ultima_venta_at: string | null;
  ultima_cantidad: number | null;
}

interface CartItem {
  producto_id: string;
  nombre: string;
  codigo: string;
  precio_venta: number;
  cantidad: number;
  stock_disponible: number;
  unidad_medida: string;
}

interface VentaListItem {
  id: string;
  usuario_id: string;
  usuario_nombre: string;
  total: number;
  estado: 'pendiente' | 'completada' | 'cancelada';
  cantidad_items: number;
  created_at: string;
}

interface VentaDetalle {
  id: string;
  venta_id: string;
  producto_id: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  producto: { id: string; nombre: string; codigo: string };
}

interface VentaWithDetails {
  id: string;
  usuario_id: string;
  total: number;
  estado: 'pendiente' | 'completada' | 'cancelada';
  created_at: string;
  usuario: { id: string; nombre_usuario: string; nik_usuario: string };
  detalles_venta: VentaDetalle[];
}

interface ResumenDia {
  fecha: string;
  total_ventas: number;
  monto_total: number;
  ingresos_total: number;
  egresos_total: number;
  productos_vendidos: Array<{
    producto_id: string;
    nombre: string;
    cantidad_total: number;
    monto_total: number;
  }>;
  ventas_por_usuario: Array<{
    usuario_id: string;
    nombre: string;
    cantidad_ventas: number;
    monto_total: number;
  }>;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface Usuario {
  id: string;
  nombre_usuario: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  return `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function estadoBadge(estado: string) {
  switch (estado) {
    case 'completada':
      return <Badge variant="success">Completada</Badge>;
    case 'pendiente':
      return <Badge variant="outline">Pendiente</Badge>;
    case 'cancelada':
      return <Badge variant="destructive">Cancelada</Badge>;
    default:
      return <Badge variant="secondary">{estado}</Badge>;
  }
}

// Badge for the unified history row type (Venta / Ingreso / Egreso)
function estadoBadgeHistorial(estado: 'Venta' | 'Ingreso' | 'Egreso') {
  switch (estado) {
    case 'Venta':
      return <Badge variant="default">Venta</Badge>;
    case 'Ingreso':
      return <Badge variant="success">Ingreso</Badge>;
    case 'Egreso':
      return <Badge variant="destructive">Egreso</Badge>;
    default:
      return <Badge variant="secondary">{estado}</Badge>;
  }
}

// ---------------------------------------------------------------------------
// Shared Product Card (used in both rubro tabs and search results)
// ---------------------------------------------------------------------------

function ProductCard({
  product,
  inCart,
  lastQty,
  ultimaCantidad,
  onAdd,
  disabled,
}: {
  product: ProductSearchResult;
  inCart?: CartItem | undefined;
  lastQty: number;
  ultimaCantidad: number | null;
  onAdd: () => void;
  disabled: boolean;
}) {
  return (
    <Card
      className={`cursor-pointer transition-colors hover:border-primary ${
        disabled ? 'opacity-60' : ''
      }`}
      onClick={() => !disabled && onAdd()}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate text-sm">{product.nombre}</p>
            <p className="text-xs text-muted-foreground font-mono">
              {product.codigo}
            </p>
            <p className="text-xs text-muted-foreground">
              Stock: {product.stock_actual} {product.unidad_medida}
            </p>
            {ultimaCantidad != null && ultimaCantidad > 0 && (
              <p className="text-[10px] text-blue-600 dark:text-blue-400">
                Última venta: {ultimaCantidad} {product.unidad_medida}
              </p>
            )}
            {lastQty !== 1 && (
              <p className="text-[10px] text-muted-foreground">
                Cant predeterminada: {lastQty} {product.unidad_medida}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="font-bold text-sm">{formatCurrency(product.precio_venta)}</p>
            {inCart ? (
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

// ---------------------------------------------------------------------------
// POS Terminal View
// ---------------------------------------------------------------------------

function POSView() {
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartMode, setCartMode] = useState<'editing' | 'confirmed'>('editing');
  const [submitting, setSubmitting] = useState(false);
  const [saleResult, setSaleResult] = useState<{
    type: 'success' | 'error';
    message: string;
    details?: string;
  } | null>(null);

  // Rubro tabs state
  const [rubros, setRubros] = useState<Rubro[]>([]);
  const [productsByRubro, setProductsByRubro] = useState<Map<string, ProductSearchResult[]>>(new Map());
  const [allProducts, setAllProducts] = useState<ProductSearchResult[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [activeRubroTab, setActiveRubroTab] = useState('todos');

  // Last sale info per product (for addToCart quantity suggestion)
  const [ultimasVentasMap, setUltimasVentasMap] = useState<Map<string, UltimaVenta>>(new Map());

  // Total quantity sold per product (for grid ordering by most sold)
  const [masVendidosMap, setMasVendidosMap] = useState<Map<string, { veces_vendido: number; monto_total: number }>>(new Map());

  // Track last used quantity per product
  const [lastQuantities, setLastQuantities] = useState<Map<string, number>>(new Map());

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
  const loadRubrosAndProducts = useCallback(async () => {
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
      let vendidosMap = new Map<string, { veces_vendido: number; monto_total: number }>();
      try {
        const { data: vendidosData } = await ventasApi.masVendidos();
        const vendidosList = (vendidosData.data as Array<{ producto_id: string; veces_vendido: number; monto_total: number }>) ?? [];
        vendidosMap = new Map(vendidosList.map((v) => [v.producto_id, { veces_vendido: v.veces_vendido, monto_total: v.monto_total }]));
      } catch {
        // non-fatal: sorting falls back to alphabetical
      }

      if (!mountedRef.current) return;
      setMasVendidosMap(vendidosMap);

      // Sort: most-sold products first (by total historical quantity),
      // never-sold products alphabetically at the end
      const sorted = [...products].sort((a, b) => {
        const ca = vendidosMap.get(a.id)?.veces_vendido ?? 0;
        const cb = vendidosMap.get(b.id)?.veces_vendido ?? 0;
        if (ca > 0 && cb > 0) return cb - ca;       // both sold: most sold first
        if (ca > 0 && cb === 0) return -1;          // a sold, b not → a first
        if (ca === 0 && cb > 0) return 1;           // b sold, a not → b first
        return a.nombre.localeCompare(b.nombre);     // both unsold → alphabetical
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
    } catch (err) {
      console.error('Error cargando productos del POS:', err);
    } finally {
      if (mountedRef.current) setLoadingProducts(false);
    }
  }, []);

  // Fetch rubros and products on mount
  useEffect(() => {
    loadRubrosAndProducts();
  }, [loadRubrosAndProducts]);

  // Search products (min 3 chars)
  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    setSearchError('');

    if (query.length < 3) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const { data } = await stockApi.autocomplete(query, 'nombre');
      setSearchResults((data.data as ProductSearchResult[]) ?? []);
    } catch {
      setSearchError('Error al buscar productos');
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
      (ultimaCantidad != null && ultimaCantidad > 0 ? ultimaCantidad : lastQuantities.get(product.id) ?? 1);

    // If the requested (last-sold) quantity exceeds available stock, fall back
    // to the available stock so the product can still be loaded — but warn the
    // user. We only block hard when there is zero stock.
    let qty = requestedQty;
    let stockWarning: string | null = null;
    if (qty > product.stock_actual) {
      if (product.stock_actual <= 0) {
        setSearchError(`Stock insuficiente para ${product.nombre}. Disponible: ${product.stock_actual}`);
        return;
      }
      qty = product.stock_actual;
      stockWarning = `Stock insuficiente para ${product.nombre}: se cargó el disponible (${product.stock_actual} ${product.unidad_medida}) en lugar de la última venta (${requestedQty} ${product.unidad_medida}).`;
    }

    // If cart is frozen after a confirmed sale, discard the previous cart and
    // start fresh with just this product. We use a direct setCart([...item])
    // instead of an updater function to avoid React batching pitfalls.
    if (cartMode === 'confirmed') {
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
      setSearchError(next.searchError);
      setLastQuantities((prev) => new Map(prev).set(product.id, qty));
      return;
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.producto_id === product.id);
      if (existing) {
        const newQty = existing.cantidad + qty;
        if (newQty > product.stock_actual) {
          setSearchError(`Stock insuficiente para ${product.nombre}. Disponible: ${product.stock_actual}`);
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
      setSearchError(stockWarning);
    } else {
      setSearchError('');
    }
  };

  // Update quantity
  const updateQuantity = (productoId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.producto_id !== productoId) return item;
          const newQty = item.cantidad + delta;
          if (newQty <= 0) return null;
          if (newQty > item.stock_disponible) {
            setSearchError(`Stock insuficiente para ${item.nombre}. Disponible: ${item.stock_disponible}`);
            return item;
          }
          setSearchError('');
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
          setSearchError(`Stock insuficiente para ${item.nombre}. Disponible: ${item.stock_disponible}`);
          return { ...item, cantidad: item.stock_disponible };
        }
        setSearchError('');
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
        productos: cart.map((item) => ({
          producto_id: item.producto_id,
          cantidad: item.cantidad,
          precio_unitario: item.precio_venta,
        })),
      };

      const { data } = await ventasApi.create(payload);

      const venta = data.data as VentaWithDetails;
      const saleResultValue = {
        type: 'success' as const,
        message: `Venta #${venta.id.slice(0, 8)} registrada correctamente`,
        details: `Total: ${formatCurrency(venta.total)} | ${cartItemCount} items`,
      };
      setSaleResult(saleResultValue);
      setCartMode(onConfirmSuccess(saleResultValue).cartMode);
      setSearchQuery('');
      setSearchResults([]);
      // Refresh product grid + stock so the UI reflects the deducted stock
      // without requiring a full page reload.
      loadRubrosAndProducts();
      searchInputRef.current?.focus();
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { data?: { error?: { code?: string; message?: string; disponible?: number; solicitado?: number } } };
      };
      const errorData = axiosErr.response?.data?.error;
      let saleResultValue: { type: 'error'; message: string; details?: string };
      if (errorData?.code === 'STOCK_INSUFFICIENT') {
        saleResultValue = {
          type: 'error',
          message: errorData.message ?? 'Stock insuficiente',
          details: `Disponible: ${errorData.disponible} | Solicitado: ${errorData.solicitado}`,
        };
      } else {
        saleResultValue = {
          type: 'error',
          message: errorData?.message ?? 'Error al procesar la venta',
        };
      }
      setSaleResult(saleResultValue);
      setCartMode(onConfirmError(saleResultValue).cartMode);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Left: Search + Products */}
      <div className="flex-1 space-y-4">
        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            placeholder="Buscar producto (min. 3 caracteres)..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9 text-lg h-12"
          />
          {searching && (
            <RefreshCw className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
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
              onClick={() => setSearchError('')}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Sale result feedback */}
        {saleResult && (
          <div
            className={`flex items-center gap-2 rounded-md p-3 text-sm ${
              saleResult.type === 'success'
                ? 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200'
                : 'bg-destructive/10 text-destructive'
            }`}
          >
            {saleResult.type === 'success' ? (
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
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Rubro tabs (hidden when search is active) */}
        {searchQuery.length < 3 && (
          <Tabs value={activeRubroTab} onValueChange={setActiveRubroTab}>
            <TabsList className="w-full justify-start flex-wrap h-auto gap-1 p-1">
              <TabsTrigger value="todos">Todos</TabsTrigger>
              {rubros.map((rubro) => (
                <TabsTrigger key={rubro.id} value={rubro.id}>
                  {rubro.nombre}
                </TabsTrigger>
              ))}
            </TabsList>

            {loadingProducts ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Cargando productos...
              </div>
            ) : (
              <>
                <TabsContent value="todos">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {allProducts.map((product) => {
                      const inCart = cart.find((item) => item.producto_id === product.id);
                      const atStockLimit = inCart
                        ? inCart.cantidad >= product.stock_actual
                        : product.stock_actual <= 0;
                      const lastQty = lastQuantities.get(product.id) ?? 1;
                      const ultimaCantidad = ultimasVentasMap.get(product.id)?.ultima_cantidad ?? null;

                      return (
                        <ProductCard
                          key={product.id}
                          product={product}
                          inCart={inCart}
                          lastQty={lastQty}
                          ultimaCantidad={ultimaCantidad}
                          disabled={atStockLimit}
                          onAdd={() => addToCart(product)}
                        />
                      );
                    })}
                  </div>
                </TabsContent>

                {rubros.map((rubro) => {
                  const products = productsByRubro.get(rubro.id) ?? [];
                  return (
                    <TabsContent key={rubro.id} value={rubro.id}>
                      {products.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                          <Package className="mb-2 h-8 w-8" />
                          <p className="text-sm">No hay productos en este rubro</p>
                        </div>
                      ) : (
                        <div className="grid gap-2 sm:grid-cols-2">
                          {products.map((product) => {
                            const inCart = cart.find((item) => item.producto_id === product.id);
                            const atStockLimit = inCart
                              ? inCart.cantidad >= product.stock_actual
                              : product.stock_actual <= 0;
                            const lastQty = lastQuantities.get(product.id) ?? 1;
                            const ultimaCantidad = ultimasVentasMap.get(product.id)?.ultima_cantidad ?? null;

                            return (
                              <ProductCard
                                key={product.id}
                                product={product}
                                inCart={inCart}
                                lastQty={lastQty}
                                ultimaCantidad={ultimaCantidad}
                                disabled={atStockLimit}
                                onAdd={() => addToCart(product)}
                              />
                            );
                          })}
                        </div>
                      )}
                    </TabsContent>
                  );
                })}
              </>
            )}
          </Tabs>
        )}

        {/* Product results */}
        {searchQuery.length >= 3 && !searching && searchResults.length === 0 && !searchError && (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Package className="mb-2 h-8 w-8" />
            <p>No se encontraron productos</p>
          </div>
        )}

        {searchResults.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {searchResults.map((product) => {
              const inCart = cart.find((item) => item.producto_id === product.id);
              const atStockLimit = inCart
                ? inCart.cantidad >= product.stock_actual
                : product.stock_actual <= 0;
              const lastQty = lastQuantities.get(product.id) ?? 1;
              const ultimaCantidad = ultimasVentasMap.get(product.id)?.ultima_cantidad ?? null;

              return (
                <ProductCard
                  key={product.id}
                  product={product}
                  inCart={inCart}
                  lastQty={lastQty}
                  ultimaCantidad={ultimaCantidad}
                  disabled={atStockLimit}
                  onAdd={() => addToCart(product)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Right: Cart */}
      <div className="w-full lg:w-[380px] shrink-0">
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
              {cartMode === 'confirmed' && (
                <Badge variant="outline" className="ml-1 text-xs">
                  Venta confirmada
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cart.length === 0 && cartMode === 'editing' ? (
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
                        <p className="text-sm font-medium truncate">{item.nombre}</p>
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
                          disabled={cartMode === 'confirmed'}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          type="number"
                          step="0.01"
                          value={item.cantidad}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) setQuantity(item.producto_id, val);
                          }}
                          className="h-7 w-14 text-center text-xs px-1"
                          min={0.01}
                          max={item.stock_disponible}
                          disabled={cartMode === 'confirmed'}
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => updateQuantity(item.producto_id, 1)}
                          disabled={cartMode === 'confirmed' || item.cantidad >= item.stock_disponible}
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
                          disabled={cartMode === 'confirmed'}
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
                    <span className="text-xl font-bold">{formatCurrency(cartTotal)}</span>
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
                    onClick={confirmSale}
                    disabled={submitting || cart.length === 0 || cartMode === 'confirmed'}
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
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Historial View
// ---------------------------------------------------------------------------

function HistorialView({ currentUserRole, refreshKey }: { currentUserRole?: string; refreshKey?: number }) {
  const canDeleteVentas = ['admin', 'gerente'].includes(currentUserRole ?? '');
  const [filas, setFilas] = useState<FilaHistorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  // Filters
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [tipoFilaFilter, setTipoFilaFilter] = useState<string>('');
  const [usuarioFilter, setUsuarioFilter] = useState('');
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
          sort: 'created_at',
          order: 'desc',
        };
        if (fechaDesde) params.fecha_desde = fechaDesde;
        if (fechaHasta) params.fecha_hasta = fechaHasta;
        if (tipoFilaFilter) params.tipo_fila = tipoFilaFilter as 'venta' | 'movimiento';
        if (usuarioFilter) params.usuario_id = usuarioFilter;

        const { data } = await ventasApi.historial(params);
        setFilas((data.data as FilaHistorial[]) ?? []);
        if (data.pagination) {
          setPagination(data.pagination as Pagination);
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
    fetchHistorial(1);
  }, [fetchHistorial]);

  // Refetch when parent signals a cash period was closed
  useEffect(() => {
    if (refreshKey && refreshKey > 0) {
      setPagination((p) => ({ ...p, page: 1 }));
      fetchHistorial(1);
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
    setFechaDesde('');
    setFechaHasta('');
    setTipoFilaFilter('');
    setUsuarioFilter('');
  };

  // Delete a completed sale (admin/gerente only)
  const handleDelete = async (ventaId: string) => {
    if (!window.confirm('¿Eliminar esta venta? El stock se restituirá automáticamente.')) {
      return;
    }
    try {
      await ventasApi.delete(ventaId);
      setDetailOpen(false);
      fetchHistorial(1);
      alert('Venta eliminada. El stock fue restituido.');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { error?: { message?: string } } } };
      const status = axiosErr?.response?.status;
      const msg = axiosErr?.response?.data?.error?.message ?? 'Error al eliminar la venta';
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
            <Badge variant="secondary" className="mb-1">Período activo</Badge>
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
                onValueChange={(v) => setTipoFilaFilter(v === 'all' ? '' : v)}
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
                onValueChange={(v) => setUsuarioFilter(v === 'all' ? '' : v)}
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
                          {f.tipo_fila === 'venta' ? f.cantidad_items : '—'}
                        </TableCell>
                        <TableCell
                          className={
                            f.estado === 'Egreso'
                              ? 'text-right font-semibold text-red-600'
                              : 'text-right font-semibold'
                          }
                        >
                          {f.estado === 'Egreso'
                            ? `-${formatCurrency(f.monto)}`
                            : formatCurrency(f.monto)}
                        </TableCell>
                        <TableCell className="text-center">
                          {estadoBadgeHistorial(f.estado)}
                        </TableCell>
                        <TableCell className="text-right">
                          {f.tipo_fila === 'venta' ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => viewDetails(f.id)}
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
                    Mostrando {(pagination.page - 1) * pagination.limit + 1}
                    {' '}-{' '}
                    {Math.min(pagination.page * pagination.limit, pagination.total)}
                    {' '}de {pagination.total}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagination.page <= 1}
                      onClick={() => fetchHistorial(pagination.page - 1)}
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
                      onClick={() => fetchHistorial(pagination.page + 1)}
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
                : 'Cargando...'}
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
                  <p className="font-medium">{detailVenta.usuario?.nombre_usuario ?? '---'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Estado</p>
                  <div>{estadoBadge(detailVenta.estado)}</div>
                </div>
                <div>
                  <p className="text-muted-foreground">Fecha</p>
                  <p className="font-medium">{formatDate(detailVenta.created_at)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total</p>
                  <p className="font-bold text-lg">{formatCurrency(detailVenta.total)}</p>
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
                            <span className="font-medium">{d.producto?.nombre ?? '---'}</span>
                            <span className="ml-1 text-xs text-muted-foreground font-mono">
                              {d.producto?.codigo ?? ''}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {formatCurrency(d.precio_unitario)}
                          </TableCell>
                          <TableCell className="text-right text-sm">{d.cantidad}</TableCell>
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
              {canDeleteVentas && detailVenta?.estado === 'completada' && (
                <div className="pt-2 border-t">
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => handleDelete(detailVenta.id)}
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

// ---------------------------------------------------------------------------
// Resumen del Dia View
// ---------------------------------------------------------------------------

function ResumenDiaView({ currentUserRole, onCajaCerrada }: { currentUserRole?: string; onCajaCerrada?: () => void }) {
  const [resumen, setResumen] = useState<ResumenDia | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cerrando, setCerrando] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const canCerrarCaja = ['admin', 'gerente'].includes(currentUserRole ?? '');

  const fetchResumen = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await ventasApi.resumenDia();
      setResumen(data.data as ResumenDia);
    } catch {
      setError('Error al cargar el resumen del dia');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCerrarCaja = async () => {
    if (!password.trim()) return;
    setCerrando(true);
    setPasswordError('');
    try {
      await ventasApi.cerrarCaja({ password });
      setShowPasswordModal(false);
      setPassword('');
      setPasswordError('');
      await fetchResumen();
      onCajaCerrada?.();
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Error al cerrar la caja';
      setPasswordError(msg);
    } finally {
      setCerrando(false);
    }
  };

  const openPasswordModal = () => {
    setPassword('');
    setPasswordError('');
    setShowPasswordModal(true);
  };

  const closePasswordModal = () => {
    setShowPasswordModal(false);
    setPassword('');
    setPasswordError('');
  };

  useEffect(() => {
    fetchResumen();
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
        <Button variant="outline" size="sm" className="mt-3" onClick={fetchResumen}>
          Reintentar
        </Button>
      </div>
    );
  }

  if (!resumen) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">Resumen del Periodo</h2>
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
            <CardTitle className="text-sm font-medium">Inicio del Periodo Actual</CardTitle>
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
            <div className="text-2xl font-bold">{formatCurrency(resumen.monto_total)}</div>
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
                      <TableCell className="text-center">{v.cantidad_ventas}</TableCell>
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
                      <TableCell className="text-right">{p.cantidad_total}</TableCell>
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
      <Dialog open={showPasswordModal} onOpenChange={(open) => !open && closePasswordModal()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar cierre de caja</DialogTitle>
            <DialogDescription>
              Ingresá tu contraseña para confirmar el cierre. Se archivarán las ventas del período actual.
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
                  if (e.key === 'Enter' && password.trim() && !cerrando) {
                    handleCerrarCaja();
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
              onClick={handleCerrarCaja}
              disabled={!password.trim() || cerrando}
            >
              {cerrando ? 'Cerrando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Movimientos de Caja (Ingresos/Egresos) View
// ---------------------------------------------------------------------------

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-AR', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function MovimientosView() {
  const [movimientos, setMovimientos] = useState<MovimientoCajaItem[]>([]);
  const [resumen, setResumen] = useState<ResumenMovimientos>({ ingresos: 0, egresos: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCrearModal, setShowCrearModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [detalleMovimiento, setDetalleMovimiento] = useState<MovimientoCajaItem | null>(null);

  // Form state
  const [tipo, setTipo] = useState<'ingreso' | 'egreso'>('ingreso');
  const [monto, setMonto] = useState('');
  const [descripcion, setDescripcion] = useState('');

  // Password state
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const fetchMovimientos = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await movimientosApi.list();
      setMovimientos(data.data);
      setResumen(data.resumen ?? { ingresos: 0, egresos: 0, total: 0 });
    } catch {
      setError('Error al cargar los movimientos de caja');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMovimientos();
  }, [fetchMovimientos]);

  const abrirConfirmacion = () => {
    const montoNum = parseFloat(monto);
    if (!monto.trim() || isNaN(montoNum) || montoNum <= 0) {
      setPasswordError('Ingresá un monto válido mayor a 0');
      return;
    }
    setPassword('');
    setPasswordError('');
    setShowCrearModal(false);
    setShowPasswordModal(true);
  };

  const cerrarPasswordModal = () => {
    setShowPasswordModal(false);
    setPassword('');
    setPasswordError('');
  };

  const confirmarMovimiento = async () => {
    if (!password.trim()) return;
    setEnviando(true);
    setPasswordError('');
    try {
      await movimientosApi.create({
        tipo,
        monto: parseFloat(monto),
        descripcion: descripcion.trim() || undefined,
        password,
      });
      cerrarPasswordModal();
      setMonto('');
      setDescripcion('');
      setTipo('ingreso');
      await fetchMovimientos();
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Error al registrar el movimiento';
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
        <Button variant="outline" size="sm" className="mt-3" onClick={fetchMovimientos}>
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
            setMonto('');
            setDescripcion('');
            setTipo('ingreso');
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
            <div className={`text-2xl font-bold ${resumen.total >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(resumen.total)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Listado de movimientos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Movimientos del periodo actual</CardTitle>
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
                      <TableCell>{m.usuario?.nombre_usuario ?? '—'}</TableCell>
                      <TableCell className="text-right text-red-600">
                        {m.tipo === 'egreso' ? formatCurrency(m.monto) : ''}
                      </TableCell>
                      <TableCell className="text-right text-green-600">
                        {m.tipo === 'ingreso' ? formatCurrency(m.monto) : ''}
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
                  variant={tipo === 'ingreso' ? 'default' : 'outline'}
                  onClick={() => setTipo('ingreso')}
                  className={tipo === 'ingreso' ? 'bg-green-600 hover:bg-green-700' : ''}
                >
                  <ArrowDownCircle className="mr-2 h-4 w-4" />
                  Ingreso
                </Button>
                <Button
                  type="button"
                  variant={tipo === 'egreso' ? 'default' : 'outline'}
                  onClick={() => setTipo('egreso')}
                  className={tipo === 'egreso' ? 'bg-red-600 hover:bg-red-700' : ''}
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
      <Dialog open={showPasswordModal} onOpenChange={(open) => !open && cerrarPasswordModal()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar movimiento</DialogTitle>
            <DialogDescription>
              Vas a registrar un <strong>{tipo}</strong> de{' '}
              <strong>{formatCurrency(parseFloat(monto) || 0)}</strong>
              {descripcion.trim() ? ` — ${descripcion.trim()}` : ''}. Ingresá tu contraseña para confirmar.
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
                  if (e.key === 'Enter' && password.trim() && !enviando) {
                    confirmarMovimiento();
                  }
                }}
              />
            </div>
            {passwordError && (
              <p className="text-sm text-destructive">{passwordError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={cerrarPasswordModal} disabled={enviando}>
              Cancelar
            </Button>
            <Button onClick={confirmarMovimiento} disabled={!password.trim() || enviando}>
              {enviando ? 'Registrando...' : 'Confirmar'}
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
              {detalleMovimiento?.tipo === 'ingreso' ? 'Detalle de Ingreso' : 'Detalle de Egreso'}
            </DialogTitle>
          </DialogHeader>
          {detalleMovimiento && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Tipo</span>
                <span
                  className={`font-semibold ${
                    detalleMovimiento.tipo === 'ingreso' ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {detalleMovimiento.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Monto</span>
                <span
                  className={`text-lg font-bold ${
                    detalleMovimiento.tipo === 'ingreso' ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {formatCurrency(detalleMovimiento.monto)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Usuario</span>
                <span className="font-medium">{detalleMovimiento.usuario?.nombre_usuario ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Fecha y hora</span>
                <span className="font-medium">{formatDateTime(detalleMovimiento.created_at)}</span>
              </div>
              {detalleMovimiento.descripcion && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Descripción</span>
                  <span className="font-medium text-right">{detalleMovimiento.descripcion}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">ID</span>
                <span className="font-mono text-xs">{detalleMovimiento.id}</span>
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
          <p className="text-sm text-muted-foreground">Terminal de venta y historial</p>
        </div>
      </div>

      <Tabs defaultValue="pos">
        <TabsList>
          <TabsTrigger value="pos">
            <ShoppingCart className="mr-2 h-4 w-4" />
            Terminal POS
          </TabsTrigger>
          <TabsTrigger value="movimientos">
            <Wallet className="mr-2 h-4 w-4" />
            Ingresos/Egresos
          </TabsTrigger>
          {user?.rol !== 'despachador' && (
            <TabsTrigger value="historial">
              <Calendar className="mr-2 h-4 w-4" />
              Historial
            </TabsTrigger>
          )}
          {user?.rol !== 'despachador' && (
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
          <HistorialView currentUserRole={user?.rol} refreshKey={historialRefreshKey} />
        </TabsContent>

        <TabsContent value="resumen">
          <ResumenDiaView currentUserRole={user?.rol} onCajaCerrada={handleCajaCerrada} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
