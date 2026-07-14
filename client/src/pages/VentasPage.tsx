import { useState, useCallback, useEffect, useRef } from 'react';
import {
  stockApi,
  ventasApi,
  usuariosApi,
  rubrosApi,
  productosApi,
} from '@/lib/api-client';
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
} from 'lucide-react';

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
  cantidad_disponible: number;
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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
              Stock: {product.cantidad_disponible} {product.unidad_medida}
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

  // Last sale info per product (for sorting + display)
  const [ultimasVentasMap, setUltimasVentasMap] = useState<Map<string, UltimaVenta>>(new Map());

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

      // Fetch last-sold info per product
      let ultimasMap = new Map<string, UltimaVenta>();
      try {
        const { data: ultimasData } = await ventasApi.ultimasVentas();
        const ultimasList = (ultimasData.data as UltimaVenta[]) ?? [];
        ultimasMap = new Map(ultimasList.map((u) => [u.producto_id, u]));
      } catch {
        // non-fatal: sorting falls back to alphabetical
      }

      if (!mountedRef.current) return;
      setUltimasVentasMap(ultimasMap);

      // Sort: products with recent sales first (desc by date),
      // never-sold products alphabetically at the end
      const sorted = [...products].sort((a, b) => {
        const ua = ultimasMap.get(a.id)?.ultima_venta_at;
        const ub = ultimasMap.get(b.id)?.ultima_venta_at;
        if (ua && ub) return ub.localeCompare(ua); // recent first
        if (ua && !ub) return -1; // a sold, b never → a first
        if (!ua && ub) return 1; // b sold, a never → b first
        return a.nombre.localeCompare(b.nombre); // both never → alpha
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
    if (qty > product.cantidad_disponible) {
      if (product.cantidad_disponible <= 0) {
        setSearchError(`Stock insuficiente para ${product.nombre}. Disponible: ${product.cantidad_disponible}`);
        return;
      }
      qty = product.cantidad_disponible;
      stockWarning = `Stock insuficiente para ${product.nombre}: se cargó el disponible (${product.cantidad_disponible} ${product.unidad_medida}) en lugar de la última venta (${requestedQty} ${product.unidad_medida}).`;
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.producto_id === product.id);
      if (existing) {
        const newQty = existing.cantidad + qty;
        if (newQty > product.cantidad_disponible) {
          setSearchError(`Stock insuficiente para ${product.nombre}. Disponible: ${product.cantidad_disponible}`);
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
          stock_disponible: product.cantidad_disponible,
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
    setSearchError('');
  };

  // Cart totals
  const cartTotal = cart.reduce(
    (sum, item) => sum + item.precio_venta * item.cantidad,
    0,
  );
  const cartItemCount = cart.reduce((sum, item) => sum + item.cantidad, 0);

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
      setSaleResult({
        type: 'success',
        message: `Venta #${venta.id.slice(0, 8)} registrada correctamente`,
        details: `Total: ${formatCurrency(venta.total)} | ${cartItemCount} items`,
      });
      setCart([]);
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
      if (errorData?.code === 'STOCK_INSUFFICIENT') {
        setSaleResult({
          type: 'error',
          message: errorData.message ?? 'Stock insuficiente',
          details: `Disponible: ${errorData.disponible} | Solicitado: ${errorData.solicitado}`,
        });
      } else {
        setSaleResult({
          type: 'error',
          message: errorData?.message ?? 'Error al procesar la venta',
        });
      }
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
                        ? inCart.cantidad >= product.cantidad_disponible
                        : product.cantidad_disponible <= 0;
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
                              ? inCart.cantidad >= product.cantidad_disponible
                              : product.cantidad_disponible <= 0;
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
                ? inCart.cantidad >= product.cantidad_disponible
                : product.cantidad_disponible <= 0;
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
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cart.length === 0 ? (
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
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => updateQuantity(item.producto_id, 1)}
                          disabled={item.cantidad >= item.stock_disponible}
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
                    disabled={submitting || cart.length === 0}
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

function HistorialView() {
  const [ventas, setVentas] = useState<VentaListItem[]>([]);
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
  const [estadoFilter, setEstadoFilter] = useState<string>('');
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

  const fetchVentas = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const params: Record<string, unknown> = {
          page,
          limit: pagination.limit,
          sort: 'created_at',
          order: 'desc',
        };
        if (fechaDesde) params.fecha_desde = fechaDesde;
        if (fechaHasta) params.fecha_hasta = fechaHasta;
        if (estadoFilter) params.estado = estadoFilter;
        if (usuarioFilter) params.usuario_id = usuarioFilter;

        const { data } = await ventasApi.list(params);
        setVentas((data.data as VentaListItem[]) ?? []);
        if (data.pagination) {
          setPagination(data.pagination as Pagination);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    },
    [pagination.limit, fechaDesde, fechaHasta, estadoFilter, usuarioFilter],
  );

  useEffect(() => {
    fetchVentas(1);
  }, [fetchVentas]);

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
    setEstadoFilter('');
    setUsuarioFilter('');
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-end gap-3">
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
              <Label className="text-xs">Estado</Label>
              <Select
                value={estadoFilter}
                onValueChange={(v) => setEstadoFilter(v === 'all' ? '' : v)}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="completada">Completada</SelectItem>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
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
          ) : ventas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <ShoppingCart className="mb-2 h-8 w-8" />
              <p>No hay ventas registradas</p>
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
                    {ventas.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell className="text-sm">
                          {formatDate(v.created_at)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {v.usuario_nombre}
                        </TableCell>
                        <TableCell className="text-center">{v.cantidad_items}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(v.total)}
                        </TableCell>
                        <TableCell className="text-center">
                          {estadoBadge(v.estado)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => viewDetails(v.id)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
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
                      onClick={() => fetchVentas(pagination.page - 1)}
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
                      onClick={() => fetchVentas(pagination.page + 1)}
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

function ResumenDiaView() {
  const [resumen, setResumen] = useState<ResumenDia | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Fecha</CardTitle>
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main VentasPage
// ---------------------------------------------------------------------------

export function VentasPage() {
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
          <TabsTrigger value="historial">
            <Calendar className="mr-2 h-4 w-4" />
            Historial
          </TabsTrigger>
          <TabsTrigger value="resumen">
            <DollarSign className="mr-2 h-4 w-4" />
            Resumen del Dia
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pos">
          <POSView />
        </TabsContent>

        <TabsContent value="historial">
          <HistorialView />
        </TabsContent>

        <TabsContent value="resumen">
          <ResumenDiaView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
