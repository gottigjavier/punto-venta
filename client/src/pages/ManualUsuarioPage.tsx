import type { ReactNode } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BookOpen, Lightbulb, Rocket } from 'lucide-react';

function Ejemplo({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="my-3 rounded-lg border border-border/60 bg-muted p-4">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <Lightbulb className="h-4 w-4 text-amber-500" />
        {title ?? 'Ejemplo'}
      </p>
      <div className="space-y-2 text-sm text-foreground/90">{children}</div>
    </div>
  );
}

function Pasos({ children }: { children: ReactNode }) {
  return <ol className="ml-5 list-decimal space-y-1.5 text-sm">{children}</ol>;
}

function FilaPaso({ children }: { children: ReactNode }) {
  return <li className="leading-relaxed">{children}</li>;
}

export function ManualUsuarioPage() {
  return (
    <div className="space-y-6">
      {/* ============================================================ */}
      {/* Portada */}
      {/* ============================================================ */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <BookOpen className="h-6 w-6" />
          Manual de Usuario
        </h1>
        <p className="text-sm text-muted-foreground">
          Guía completa del Punto de Venta: cómo entrar, qué hace cada módulo y cómo
          interpretar toda la información. Leelo de punta a punta y vas a manejar el
          sistema sin ayuda.
        </p>
      </div>

      {/* ============================================================ */}
      {/* 1. Introducción */}
      {/* ============================================================ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">1. Introducción</CardTitle>
          <CardDescription>
            Qué es el sistema, cómo entrar y cómo se organiza.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed">
          <div>
            <h3 className="mb-1.5 text-base font-semibold">Qué es el Punto de Venta</h3>
            <p>
              El Punto de Venta es el sistema de ventas y administración de tu negocio.
              Con él podés cobrar ventas desde la terminal, controlar el stock de tus
              productos, armar el catálogo (productos, proveedores y rubros), registrar
              ingresos y egresos de caja, cerrar la caja del día y consultar el historial
              completo. Todo queda registrado y ordenado, así que en cualquier momento
              podés saber cuánto vendiste, qué producto se agotó o cuánto dinero entró y
              salió.
            </p>
          </div>

          <div>
            <h3 className="mb-1.5 text-base font-semibold">Cómo entrar al sistema</h3>
            <Pasos>
              <FilaPaso>
                Abrí el navegador y andá a la dirección del sistema. Vas a ver la
                pantalla de ingreso: un fondo verde con el logo del negocio y el título
                "Punto de Venta".
              </FilaPaso>
              <FilaPaso>
                En el campo <span className="font-medium">Usuario</span> escribí tu
                nombre de usuario (el "NIK" que te dieron al crearte la cuenta).
              </FilaPaso>
              <FilaPaso>
                En el campo <span className="font-medium">Contraseña</span> escribí tu
                contraseña personal.
              </FilaPaso>
              <FilaPaso>Tocá el botón <span className="font-medium">Ingresar</span>.</FilaPaso>
            </Pasos>
            <p className="mt-2">
              Si la contraseña o el usuario son incorrectos, aparece un aviso en rojo
              (por ejemplo "Credenciales inválidas"). Revisá que no haya espacios de
              más o mayúsculas cambiadas y volvé a intentar.
            </p>
            <p>
              Cuando la cuenta recién se crea, la primera vez puede tardar unos
              segundos. La propia pantalla de ingreso lo aclara: el sistema está
              hospedado en servidores gratuitos y a veces tarda en responder. Es
              normal: esperá con paciencia un momento y no cierres la ventana.
            </p>
            <Ejemplo title="Ejemplo">
              <p>
                Julián es despachador. Le dieron el usuario <span className="font-mono text-xs">julian_castellano</span> y una
                contraseña. Al entrar, la aplicación lo lleva directo a la pantalla de
                Ventas, que es el lugar donde empieza a trabajar todos los días.
              </p>
            </Ejemplo>
          </div>

          <div>
            <h3 className="mb-1.5 text-base font-semibold">Qué pasa si olvidás tu contraseña</h3>
            <p>
              El sistema no tiene un botón de "recuperar contraseña": tu contraseña
              solo la podés saber vos. Si la olvidaste, pedile a un administrador que
              la restablezca. El administrador entra al módulo <span className="font-medium">Usuarios</span>,
              edita tu cuenta, escribe una contraseña nueva y te la pasa. Tus datos y
              tu historial se conservan; solo cambia la clave.
            </p>
          </div>

          <div>
            <h3 className="mb-1.5 text-base font-semibold">Los roles de usuario</h3>
            <p>
              Cada persona entra al sistema con un <span className="font-medium">rol</span>, que define qué
              puede ver y qué puede hacer. Hay tres roles:
            </p>
            <div className="mt-2 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rol</TableHead>
                    <TableHead>Qué puede hacer</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>
                      <Badge variant="destructive">Admin</Badge>
                    </TableCell>
                    <TableCell className="leading-relaxed">
                      Acceso total. Maneja todo el sistema y además administra los
                      usuarios: dar de alta, cambiar roles, desactivar cuentas y
                      restablecer contraseñas. Es la única cuenta que ve el módulo
                      Usuarios.
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>
                      <Badge variant="default">Gerente</Badge>
                    </TableCell>
                    <TableCell className="leading-relaxed">
                      Maneja toda la operación del negocio: ventas, productos,
                      proveedores, rubros, stock, historial, resumen del período y
                      cierres de caja. Puede cerrar la caja y eliminar ventas. Lo único
                      que no ve es el módulo Usuarios (es exclusivo del Admin).
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>
                      <Badge variant="secondary">Despachador</Badge>
                    </TableCell>
                    <TableCell className="leading-relaxed">
                      Opera en la parte comercial del día a día: vender desde la
                      Terminal POS y consultar el stock. El menú le muestra solo
                      Ventas, Stock y este Manual. No ve el historial, el resumen ni los
                      módulos de gestión.
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            <p className="mt-2">
              Tu rol se muestra al pie de la barra lateral, debajo de tu nombre de
              usuario. Si ves una sección en el menú de otra persona pero no en el
              tuyo, es porque tu rol no la tiene habilitada.
            </p>
          </div>

          <div>
            <h3 className="mb-1.5 text-base font-semibold">La barra lateral (el menú)</h3>
            <p>
              Una vez adentro, a la izquierda tenés la barra lateral con el logo
              "Punto de Venta" arriba y los botones de cada módulo:
            </p>
            <ul className="ml-5 list-disc space-y-1">
              <li><span className="font-medium">Ventas</span> — la terminal de cobro y todo lo relacionado (historial, resumen, movimientos de caja).</li>
              <li><span className="font-medium">Productos</span> — el catálogo de lo que vendés.</li>
              <li><span className="font-medium">Proveedores</span> — quienes te abastecen.</li>
              <li><span className="font-medium">Rubros</span> — las categorías de productos.</li>
              <li><span className="font-medium">Usuarios</span> — solo lo ve el Admin.</li>
              <li><span className="font-medium">Stock</span> — la vista del inventario.</li>
              <li><span className="font-medium">Administración</span> — el historial de cierres de caja.</li>
              <li><span className="font-medium">Manual de Usuario</span> — esta guía, siempre al pie de la barra lateral.</li>
            </ul>
            <p>
              El botón del módulo en el que estás parado queda resaltado, así siempre
              sabés dónde estás. En pantallas chicas o celulares, la barra lateral se
              oculta y se abre tocando el botón de menú en la esquina superior.
            </p>
            <p>
              Al final de la barra se muestran tus datos: tus iniciales, tu nombre de
              usuario, tu rol, el botón para cambiar entre tema claro y oscuro, y el
              botón para salir.
            </p>
          </div>

          <div>
            <h3 className="mb-1.5 text-base font-semibold">Cómo cerrar sesión</h3>
            <p>
              Tocá el botón de salir (el ícono de la puerta) al pie de la barra
              lateral. El sistema vuelve a la pantalla de ingreso y deja de guardar tu
              sesión. Si te apartás de la computadora aunque sea un rato, cerrá sesión:
              así nadie opera con tu cuenta por error.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/* 2. Ventas */}
      {/* ============================================================ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">2. Ventas</CardTitle>
          <CardDescription>
            La terminal de cobro y el historial de todo lo que pasa en la caja.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 text-sm leading-relaxed">
          <p>
            El módulo <span className="font-medium">Ventas</span> tiene hasta cuatro
            pestañas entre las que navegás tocando los botones de arriba en la lista:
          </p>
          <ul className="ml-5 list-disc space-y-1">
            <li><span className="font-medium">Terminal POS</span> — donde cobrás. Disponible para todos.</li>
            <li><span className="font-medium">Ingresos/Egresos</span> — cargas de dinero que no son ventas. Disponible para todos.</li>
            <li><span className="font-medium">Historial</span> — el registro del período en curso. Solo Admin y Gerente.</li>
            <li><span className="font-medium">Resumen del Periodo</span> — la foto de cómo viene la caja abierta. Solo Admin y Gerente.</li>
          </ul>

          {/* 2.1 Terminal POS */}
          <div>
            <h3 className="mb-1.5 text-base font-semibold">2.1 Terminal POS (donde se cobra)</h3>
            <p>
              Esta pantalla es la más usada del sistema. Está dividida en dos partes:
              a la izquierda los <span className="font-medium">productos</span> y a la
              derecha el <span className="font-medium">carrito de compra</span>.
            </p>

            <h4 className="mt-3 mb-1 text-sm font-semibold">Buscar un producto</h4>
            <p>
              Arriba de todo hay un campo de búsqueda con forma de lupa. Escribí el
              nombre del producto: con solo <span className="font-medium">3 letras</span> el sistema ya
              empieza a buscar. Mientras buscás, la grilla de productos se reemplaza
              por los resultados; el ícono de búsqueda gira mientras trabaja.
            </p>

            <h4 className="mt-3 mb-1 text-sm font-semibold">La grilla y los rubros</h4>
            <p>
              Cuando no estás buscando, ves todos los productos ordenados en tarjetas.
              Arriba hay una fila de pestañas: <span className="font-medium">Todos</span> y una por cada
              rubro (por ejemplo "Bebidas", "Almacén", "Fiambres"). Tocá un rubro para
              ver solo esos productos. El orden de la grilla no es casual: los
              productos que más se venden aparecen primero, y los que todavía no se
              vendieron van al final, en orden alfabético.
            </p>

            <h4 className="mt-3 mb-1 text-sm font-semibold">La tarjeta de cada producto</h4>
            <p>Cada producto es una tarjeta que muestra:</p>
            <ul className="ml-5 list-disc space-y-1">
              <li>El <span className="font-medium">nombre</span> y el <span className="font-medium">código</span> del producto.</li>
              <li>El <span className="font-medium">stock disponible</span>: "Stock: 12 unidad" (o en la unidad que sea).</li>
              <li>El <span className="font-medium">precio de venta</span>, en negrita, a la derecha.</li>
              <li>Si ese producto ya se vendió alguna vez, una línea en azul: "Última venta: 2 unidad". Es la cantidad que se vendió en la última oportunidad y la que se va a cargar en el carrito.</li>
              <li>Si en esta sesión ya usaste una cantidad distinta de 1 para ese producto, una línea gris: "Cant predeterminada: 3".</li>
              <li>El botón <span className="font-medium">Agregar</span> para sumarlo al carrito. Tocar la tarjeta también lo agrega.</li>
            </ul>
            <p>
              Cuando un producto se queda sin stock, su tarjeta se ve atenuada y en
              lugar del botón "Agregar" figura el aviso <Badge variant="destructive" className="align-middle">Sin stock</Badge>.
            </p>
            <Ejemplo>
              <p>
                Un cliente pide "1 kg de azúcar". En la pestaña "Almacén" encontrás la
                azúcar, tocás la tarjeta y se agrega al carrito. Como el producto es por
                peso, el carrito carga 1 kg (o la última cantidad que se vendió). Si
                pediste más de lo que hay disponible, el sistema usa lo que hay y te
                avisa con un mensaje en rojo: "Stock insuficiente para Azúcar: se cargó
                el disponible (0,5 kg) en lugar de la última venta (1 kg)."
              </p>
            </Ejemplo>

            <h4 className="mt-3 mb-1 text-sm font-semibold">El carrito</h4>
            <p>
              A la derecha, la tarjeta <span className="font-medium">Carrito</span> muestra los productos
              cargados y un contador de <span className="font-medium">items</span>. El conteo funciona así:
              a los productos que se venden <em>por unidad</em>, cada unidad cuenta como
              un item (3 unidades = 3 items); a los que se venden <em>por peso o
              volumen</em> (kg, g, l, ml), toda la línea cuenta como un item aunque
              sean 1,25 kg.
            </p>
            <p>Con un producto ya cargado podés:</p>
            <ul className="ml-5 list-disc space-y-1">
              <li>Ajustar la cantidad con los botones <span className="font-medium">(−)</span> y <span className="font-medium">(+)</span>, o escribiendo el número directamente en el cuadro de cantidad.</li>
              <li>Quitarlo del carrito con el botón de la <span className="font-medium">papelera</span>.</li>
              <li>Limpiar todo el carrito con el botón <span className="font-medium">Vaciar</span>.</li>
            </ul>
            <p>
              El sistema no te deja cargar más de lo que hay en stock: si escribís una
              cantidad mayor, te avisa "Stock insuficiente…" y ajusta al máximo
              disponible. Al pie del carrito ves el <span className="font-medium">Total</span> que va a pagar el
              cliente.
            </p>
            <p>
              Al carrito se lo podés modificar todo lo que quieras <em>antes</em> de
              confirmar: cambiar cantidades, sacar productos, vaciarlo. Nada de eso
              afecta al stock ni al negocio: el movimiento real pasa solo cuando
              confirmás la venta.
            </p>

            <h4 className="mt-3 mb-1 text-sm font-semibold">Confirmar la venta</h4>
            <Pasos>
              <FilaPaso>
                Revisá el carrito: productos, cantidades y total.
              </FilaPaso>
              <FilaPaso>
                Tocá el botón <span className="font-medium">Confirmar Venta</span>. Mientras procesa
                muestra "Procesando…".
              </FilaPaso>
              <FilaPaso>
                Al confirmarse aparece un aviso verde: "Venta #xxxxxxxx registrada
                correctamente" con el total y la cantidad de items.
              </FilaPaso>
            </Pasos>
            <p>
              Al confirmar la venta pasan tres cosas al mismo tiempo: la venta queda
              registrada, el stock se descuenta automáticamente y el carrito queda
              <span className="font-medium">congelado</span> con la etiqueta "Venta confirmada" (no podés tocar
              las cantidades del carrito anterior). Para atender al próximo cliente,
              tocá cualquier producto y el carrito se reinicia solo con ese producto, o
              tocá "Vaciar".
            </p>
            <p>
              Si justo en el momento de confirmar ya no alcanza el stock (por ejemplo,
              dos personas vendiendo a la vez), aparece un aviso en rojo "Stock
              insuficiente" con la cantidad disponible y la solicitada. El carrito se
              mantiene para que corrijas la cantidad y vuelvas a confirmar.
            </p>
            <Ejemplo title="Ejemplo completo de una venta">
              <p>
                Llega una clienta y compra dos empanadas de carne y una gaseosa. En la
                búsqueda escribís "empana": tocás la empanada de carne y se suma al
                carrito (si la última venta fue de 2, carga 2 directamente). Después
                buscás "gaseosa", tocás la de 1,5 lts y queda la gaseosa al lado de las
                empanadas. El carrito muestra 2 items (o 3 si la gaseosa cuenta por
                unidad). El Total es la suma de las tres cosas. Confirmás la venta y el
                sistema muestra "Venta #a1b2c3d4 registrada correctamente — Total:
                $4.500,00 | 3 items". El stock de empanadas y gaseosas ya bajó solo.
              </p>
            </Ejemplo>
          </div>

          {/* 2.2 Ingresos y Egresos */}
          <div>
            <h3 className="mb-1.5 text-base font-semibold">
              2.2 Ingresos y Egresos (movimientos de caja)
            </h3>
            <p>
              Esta pestaña existe para registrar el dinero que entra o sale de la caja
              por motivos que <em>no son</em> una venta. Por ejemplo:
            </p>
            <ul className="ml-5 list-disc space-y-1">
              <li><span className="font-medium">Ingreso</span>: ponés dinero inicial para dar vuelto, o recibís dinero por otra razón.</li>
              <li><span className="font-medium">Egreso</span>: pagás a un proveedor, retirás efectivo para gastos, pagás el delivery de envíos, etc.</li>
            </ul>
            <p>Arriba ves tres tarjetas con los totales:</p>
            <ul className="ml-5 list-disc space-y-1">
              <li><span className="font-medium text-green-600">Ingresos</span> — suma de todo lo que entró.</li>
              <li><span className="font-medium text-red-600">Egresos</span> — suma de todo lo que salió.</li>
              <li>
                <span className="font-medium">Diferencia</span> — es Ingresos menos Egresos. Si queda
                positivo (o cero) se muestra en verde; si es negativo, en rojo.
              </li>
            </ul>
            <p>
              La tabla "<span className="font-medium">Movimientos del periodo actual</span>" lista cada
              movimiento con su fecha y hora, el usuario que lo cargó, y el monto en
              la columna de cada tipo: los egresos van en rojo y los ingresos en
              verde. Cada movimiento tiene su botón <span className="font-medium">Ver detalles</span> para
              verlo completo (tipo, monto, usuario, fecha y hora, descripción e
              identificador).
            </p>

            <h4 className="mt-3 mb-1 text-sm font-semibold">Registrar un movimiento</h4>
            <Pasos>
              <FilaPaso>Tocá el botón <span className="font-medium">Nuevo Movimiento</span>.</FilaPaso>
              <FilaPaso>
                En el formulario elegí el <span className="font-medium">Tipo</span>: el botón "Ingreso" (verde) o
                el botón "Egreso" (rojo).
              </FilaPaso>
              <FilaPaso>
                Completá el <span className="font-medium">Monto</span> y, si querés, una
                <span className="font-medium">Descripción</span> (por ejemplo "Pago a proveedor" o "Ingreso
                por caja chica").
              </FilaPaso>
              <FilaPaso>Tocá <span className="font-medium">Enviar</span>.</FilaPaso>
              <FilaPaso>
                Se abre la confirmación, donde el sistema te muestra el resumen exacto:
                "Vas a registrar un egreso de $15.000,00 — Pago a proveedor". Confirmala
                con <span className="font-medium">tu propia contraseña</span>.
              </FilaPaso>
              <FilaPaso>Tocá <span className="font-medium">Confirmar</span> y el movimiento queda cargado.</FilaPaso>
            </Pasos>
            <p>
              La contraseña al final no es un capricho: garantiza que cada carga queda
              asociada a la persona que la hizo, algo clave a la hora de revisar la
              caja. Si el monto es inválido (por ejemplo cero o negativo), el sistema
              avisa "Ingresá un monto válido mayor a 0".
            </p>
          </div>

          {/* 2.3 Historial */}
          <div>
            <h3 className="mb-1.5 text-base font-semibold">2.3 Historial (solo Admin y Gerente)</h3>
            <p>
              Esta pestaña muestra <span className="font-medium">todo lo que pasó en la caja abierta</span>,
              mezclando ventas y movimientos de dinero en una sola lista, de lo más
              reciente a lo más antiguo. La etiqueta "<span className="font-medium">Período activo</span>" te
              recuerda que estás viendo el período de caja en curso: cuando se cierra
              la caja, esos registros se archivan y pasan a verse en Administración.
            </p>

            <h4 className="mt-3 mb-1 text-sm font-semibold">Filtros del historial</h4>
            <ul className="ml-5 list-disc space-y-1">
              <li><span className="font-medium">Fecha Desde</span> y <span className="font-medium">Fecha Hasta</span> — acotás el período por fechas.</li>
              <li><span className="font-medium">Tipo</span> — "Todos", solo "Ventas" o solo "Movimientos".</li>
              <li><span className="font-medium">Vendedor</span> — el usuario que hizo la venta o el movimiento.</li>
              <li>El botón <span className="font-medium">Limpiar</span> quita todos los filtros de una vez.</li>
            </ul>

            <h4 className="mt-3 mb-1 text-sm font-semibold">Columnas y estados</h4>
            <p>La tabla tiene: Fecha, Vendedor, Items, Total, Estado y Acciones.</p>
            <ul className="ml-5 list-disc space-y-1">
              <li>
                <span className="font-medium">Items</span> muestra la cantidad de productos de la venta;
                los movimientos de dinero no tienen items (se ve "—").
              </li>
              <li>
                <span className="font-medium">Total</span> delante de los montos: los egresos se muestran
                en rojo con signo menos (por ejemplo "-$15.000,00"), porque es dinero
                que salió.
              </li>
              <li>
                <span className="font-medium">Estado</span> identifica el tipo de registro con una
                etiqueta de color:
                <ul className="ml-5 mt-1 list-disc space-y-0.5">
                  <li><Badge variant="default" className="align-middle">Venta</Badge> — una venta cobrada.</li>
                  <li><Badge variant="success" className="align-middle">Ingreso</Badge> — dinero que entró.</li>
                  <li><Badge variant="destructive" className="align-middle">Egreso</Badge> — dinero que salió.</li>
                </ul>
              </li>
              <li>
                <span className="font-medium">Acciones</span>: el botón del ojo abre el detalle, y solo
                está disponible para las ventas.
              </li>
            </ul>

            <h4 className="mt-3 mb-1 text-sm font-semibold">El detalle de una venta</h4>
            <p>
              Tocá el ojo de una venta y se abre "<span className="font-medium">Detalle de Venta</span>" con:
              vendedor, estado, fecha, total y la lista de productos vendidos (nombre,
              código, precio unitario, cantidad y subtotal). Ahí podés confirmar qué
              se vendió exactamente y cuánto pagó el cliente.
            </p>
            <p>
              Si la venta está <span className="font-medium">Completada</span> y tu rol es Admin o Gerente, abajo
              aparece el botón <span className="font-medium text-red-600">Eliminar venta</span>. Al eliminarla, el
              sistema <span className="font-medium">devuelve el stock automáticamente</span> (los productos vuelven
              a estar disponibles). Antes pide confirmación y después avisa que el
              stock fue restituido. Usala con criterio: una venta eliminada se usa,
              por ejemplo, para corregir un error de carga.
            </p>

            <h4 className="mt-3 mb-1 text-sm font-semibold">Paginación y navegación</h4>
            <p>
              Si hay muchos registros, abajo te indica "Mostrando X - Y de Z" y vas
              pasando de página con los botones <span className="font-medium">Anterior</span> y{" "}
              <span className="font-medium">Siguiente</span>.
            </p>
            <Ejemplo title="Ejemplo de lectura del historial">
              <p>
                A media mañana abrís el Historial y ves tres filas: una venta de
                $4.500,00 con badge "Venta", un ingreso de $10.000,00 con badge
                "Ingreso", y un egreso de -$15.000,00 en rojo con badge "Egreso".
                Tocando el ojo de la venta confirmás que fue la de las empanadas y la
                gaseosa. Todo eso fue en la caja abierta y queda registrado a nombre
                del vendedor que operó.
              </p>
            </Ejemplo>
          </div>

          {/* 2.4 Resumen del Periodo */}
          <div>
            <h3 className="mb-1.5 text-base font-semibold">
              2.4 Resumen del Periodo (solo Admin y Gerente)
            </h3>
            <p>
              Esta pestaña es la <span className="font-medium">foto de la caja abierta</span>: un vistazo rápido
              de cómo viene el período en curso. Arriba hay tres tarjetas:
            </p>
            <ul className="ml-5 list-disc space-y-1">
              <li><span className="font-medium">Inicio del Periodo Actual</span> — la fecha en que se abrió esta caja.</li>
              <li><span className="font-medium">Total Ventas</span> — la cantidad de ventas del período.</li>
              <li><span className="font-medium">Monto Total</span> — la suma de dinero de esas ventas.</li>
            </ul>
            <p>
              Después viene la tarjeta "<span className="font-medium">Ingresos y Egresos</span>" con los totales
              (ingresos en verde, egresos en rojo), la tabla "<span className="font-medium">Ventas por
              Vendedor</span>" (cuántas ventas hizo cada persona y por cuánto) y la lista de
              "<span className="font-medium">Productos Vendidos</span>" (qué producto se vendió, cuánto y a
              cuánto sumó).
            </p>

            <h4 className="mt-3 mb-1 text-sm font-semibold">El Cierre de Caja</h4>
            <p>
              Cuando termina el turno (el período), hay que cerrar la caja. El botón{" "}
              <span className="font-medium">Cierre de Caja</span> lo ven solo Admin y Gerente. Al tocarlo, el
              sistema pide: <em>"Ingresá tu contraseña para confirmar el cierre. Se
              archivarán las ventas del período actual."</em>
            </p>
            <Pasos>
              <FilaPaso>Comprobá que ya no falten ventas ni movimientos por cargar.</FilaPaso>
              <FilaPaso>Tocá <span className="font-medium">Cierre de Caja</span>.</FilaPaso>
              <FilaPaso>Escribí tu contraseña y tocá <span className="font-medium">Confirmar</span>.</FilaPaso>
              <FilaPaso>
                El período se archiva (no se borra: pasa a Administración), el resumen
                se reinicia y arranca un período nuevo desde cero.
              </FilaPaso>
            </Pasos>
            <p>
              Un detalle importante: cerrar la caja <span className="font-medium">no elimina nada</span>. Todos
              los datos del período quedan guardados en el módulo Administración, donde
              se pueden volver a ver y exportar.
            </p>
            <Ejemplo title="Ejemplo de cierre">
              <p>
                A las 19 h, el gerente revisa el Resumen: 34 ventas por $212.400,00,
                sin movimientos pendientes. Cierra la caja con su contraseña. El
                resumen vuelve a cero, con una fecha de inicio nueva, y desde
                Administración se puede consultar ese cierre con sus ventas y
                movimientos.
              </p>
            </Ejemplo>
          </div>
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/* 3. Productos */}
      {/* ============================================================ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">3. Productos</CardTitle>
          <CardDescription>
            El catálogo de todo lo que vendés.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed">
          <p>
            En este módulo se crean, modifican y eliminan los productos. Arriba tenés
            el campo de búsqueda (<span className="font-medium">"Buscar productos..."</span>), el botón de
            actualizar y el botón <span className="font-medium">Nuevo Producto</span>.
          </p>

          <h3 className="text-base font-semibold">La lista de productos</h3>
          <p>Cada fila muestra: Código, Nombre, Rubro, Proveedor, P. Compra, P. Venta, Stock, Estado y Acciones.</p>
          <ul className="ml-5 list-disc space-y-1">
            <li><span className="font-medium">Código</span> — el identificador del producto (puede ser el código interno o de barras).</li>
            <li><span className="font-medium">Rubro</span> y <span className="font-medium">Proveedor</span> — la categoría y el proveedor asignados.</li>
            <li><span className="font-medium">P. Compra</span> y <span className="font-medium">P. Venta</span> — cuánto te costó y a cuánto lo vendés.</li>
            <li><span className="font-medium">Stock</span> — la cantidad disponible.</li>
            <li><span className="font-medium">Estado</span> — <Badge variant="success" className="align-middle">Activo</Badge> (verde) o <Badge variant="secondary" className="align-middle">Inactivo</Badge> (gris).</li>
            <li><span className="font-medium">Acciones</span> — dos botones: el lápiz para editar y la papelera roja para eliminar.</li>
          </ul>
          <p>
            Prestá atención al número de <span className="font-medium">Stock</span>: cuando un producto tiene
            cargada una "Cantidad Aviso" y el stock cayó por debajo de ese aviso, el
            número de stock se pinta <span className="font-medium text-blue-500">en azul</span>. Es el aviso
            visual del sistema para que repongas el producto.
          </p>

          <h3 className="text-base font-semibold">Dar de alta un producto</h3>
          <Pasos>
            <FilaPaso>Tocá <span className="font-medium">Nuevo Producto</span>.</FilaPaso>
            <FilaPaso>Completá los campos del formulario (abajo están explicados).</FilaPaso>
            <FilaPaso>Tocá <span className="font-medium">Crear Producto</span>.</FilaPaso>
          </Pasos>
          <p>Los campos con asterisco (*) son obligatorios. El botón de guardar queda deshabilitado hasta completarlos:</p>
          <ul className="ml-5 list-disc space-y-1">
            <li><span className="font-medium">Nombre *</span> — el nombre tal cual lo van a ver en la terminal.</li>
            <li><span className="font-medium">Codigo *</span> — el código del producto, único para identificarlo.</li>
            <li><span className="font-medium">Precio Compra *</span> — lo que te costó a vos. Acepta decimales (0,01).</li>
            <li><span className="font-medium">Precio Venta *</span> — lo que cobrás al cliente. Es el precio que muestra la terminal.</li>
            <li>
              <span className="font-medium">Cantidad en Stock *</span> — cuánto hay disponible hoy. Acepta
              decimales: si son productos por peso, podés cargar 1,5 (kg) o 250 (g).
            </li>
            <li>
              <span className="font-medium">Rubro *</span> — de qué categoría es. Solo aparecen los rubros
              activos. Si te falta una categoría, creala antes en el módulo Rubros.
            </li>
            <li><span className="font-medium">Proveedor *</span> — quién te abastece ese producto.</li>
            <li>
              <span className="font-medium">Unidad de Medida *</span> — "unidad", "kg", "g", "l" o "ml".
              Importante: define cómo se cuenta en el carrito (por unidad o por
              peso/volumen) y cómo se interpreta el stock.
            </li>
            <li>
              <span className="font-medium">Cantidad Aviso</span> — el número "alerta": si el stock baja de
              este valor, el número de stock aparece en azul. Si lo dejás en 0, no hay
              aviso.
            </li>
            <li><span className="font-medium">Fecha Compra</span> — cuándo compraste ese lote (opcional).</li>
            <li>
              <span className="font-medium">Fecha Vencimiento</span> — cuándo vence (opcional). Si lo cargás,
              el producto aparece como "Por vencer" o "Vencido" en el módulo Stock
              cuando corresponde.
            </li>
            <li><span className="font-medium">N° de Lote</span> — se asigna al ingresar stock (crear un lote) en el módulo Stock; identifica la entrega o remesa (opcional, para control de tráficos).</li>
          </ul>

          <h3 className="text-base font-semibold">Editar y eliminar</h3>
          <p>
            Para <span className="font-medium">editar</span>, tocá el lápiz de la fila: el formulario se abre
            con los datos actuales, cambiás lo que necesites (por ejemplo el precio de
            venta o la cantidad en stock) y tocás <span className="font-medium">Guardar Cambios</span>.
          </p>
          <p>
            Para <span className="font-medium">eliminar</span>, tocá la papelera. El sistema te pregunta
            "¿Estás seguro de que querés eliminar el producto X?" Al confirmar, el producto se
            <span className="font-medium"> desactiva</span>: desaparece del catálogo y del POS, pero sus
            datos se conservan y podés restaurarlo más adelante.
          </p>
          <p>
            Con el botón <span className="font-medium">Inactivos</span> arriba de la lista ves los
            productos desactivados. Cada fila tiene un botón <span className="font-medium">Restaurar</span>{" "}
            (solo Admin y Gerente) que vuelve a activar el producto y lo reincorpora al catálogo. También
            podés recrearlo: si al crear un producto el sistema detecta que ese código ya existe pero como
            inactivo, te va a ofrecer la opción de <span className="font-medium">restaurar el producto
            existente</span>.
          </p>
          <p>
            No se borra nada de forma definitiva: respetá que no se puede restaurar un producto que aún
            tiene <span className="font-medium">stock activo</span> (lotes con inventario disponible);
            primero retirá o agotá ese stock.
          </p>
          <Ejemplo title="Ejemplo de alta">
            <p>
              Llega un cargamento de cajones de manzanas. Creás el producto: Nombre
              "Manzana Roja", Código "MANZ-01", Precio Compra $900, Precio Venta
              $1.200, Cantidad en Stock 30, Rubro "Frutas", Proveedor "Huerquia", Unidad
              de Medida "kg", Cantidad Aviso 5, Fecha Compra hoy. Cuando el stock baje
              de 5 kg, el número de stock se pintará en azul y vas a saber que hay que
              reponer.
            </p>
          </Ejemplo>
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/* 4. Proveedores */}
      {/* ============================================================ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">4. Proveedores</CardTitle>
          <CardDescription>
            Quiénes te abastecen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed">
          <p>
            Acá guardás los datos de tus proveedores (fabricantes o distribuidores).
            La lista muestra <span className="font-medium">Razon Social</span>, <span className="font-medium">Representante</span>,{" "}
            <span className="font-medium">CUIT</span>, <span className="font-medium">Email</span> y <span className="font-medium">Telefonos</span>, ordenados
            alfabéticamente por razón social. Podés buscar por razón social o CUIT en
            el campo de búsqueda.
          </p>

          <h3 className="text-base font-semibold">Dar de alta un proveedor</h3>
          <Pasos>
            <FilaPaso>Tocá <span className="font-medium">Nuevo Proveedor</span>.</FilaPaso>
            <FilaPaso>Completá el formulario.</FilaPaso>
            <FilaPaso>Tocá <span className="font-medium">Crear Proveedor</span>.</FilaPaso>
          </Pasos>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              <span className="font-medium">Razon Social *</span> — el nombre comercial o legal. Es el único
              campo obligatorio (máximo 200 caracteres).
            </li>
            <li><span className="font-medium">Representante</span> — la persona de contacto (opcional).</li>
            <li>
              <span className="font-medium">CUIT</span> — se va formateando solo a medida que escribís
              (XX-XXXXXXXX-X). Si no tiene el formato correcto, el sistema avisa
              "CUIT invalido. Formato: XX-XXXXXXXX-X".
            </li>
            <li><span className="font-medium">Direccion Postal</span> — la dirección del proveedor (opcional).</li>
            <li><span className="font-medium">Email</span> — el correo de contacto (opcional, validado).</li>
            <li>
              <span className="font-medium">Telefonos</span> — podés cargar varios. Escribís un número,
              presionás <span className="font-medium">Enter</span> (o tocás el botón +) y queda como etiqueta.
              Para sacarlo, tocá la "X" de la etiqueta.
            </li>
          </ul>
          <p>
            Editar y eliminar funcionan igual que en Productos (lápiz y papelera). El
            borrado pide confirmación y no se puede deshacer. Con un proveedor cargado,
            ya podés asignarlo a los productos.
          </p>
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/* 5. Rubros */}
      {/* ============================================================ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">5. Rubros</CardTitle>
          <CardDescription>
            Las categorías de productos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed">
          <p>
            Un rubro es una categoría (por ejemplo "Bebidas", "Almacén", "Lácteos").
            Sirve para <span className="font-medium">organizar</span> el catálogo: cada producto pertenece a
            un rubro, y en la Terminal POS esos rubros son las pestañas que te dejan
            ver los productos de una categoría en particular.
          </p>
          <p>
            La lista muestra <span className="font-medium">Nombre</span>, <span className="font-medium">Descripcion</span> y{" "}
            <span className="font-medium">Estado</span> (<Badge variant="success" className="align-middle">Activo</Badge> o{" "}
            <Badge variant="secondary" className="align-middle">Inactivo</Badge>). El buscador filtra por nombre a
            medida que escribís.
          </p>
          <p>
            Para crear uno: <span className="font-medium">Nuevo Rubro</span>, escribís el{" "}
            <span className="font-medium">Nombre *</span> (obligatorio) y una{" "}
            <span className="font-medium">Descripcion</span> opcional, y tocás{" "}
            <span className="font-medium">Crear Rubro</span>. Los rubros activos son los que aparecen a la
            hora de asignar un rubro a un producto y como pestañas en la terminal. Si
            un rubro está inactivo, no se ofrece en la pantalla de productos.
          </p>
          <p>
            Editar y eliminar funcionan igual que los otros módulos: para editar tocás
            el lápiz y para eliminar la papelera (con confirmación; no se puede
            deshacer).
          </p>
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/* 6. Usuarios */}
      {/* ============================================================ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">6. Usuarios (solo Admin)</CardTitle>
          <CardDescription>
            Quién puede entrar al sistema y con qué rol.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed">
          <p>
            Este módulo lo ve únicamente el Admin. Desde acá se crean las cuentas, se
            cambian los roles, se restablecen contraseñas y se desactivan usuarios.
          </p>

          <h3 className="text-base font-semibold">Buscar y filtrar</h3>
          <p>
            El buscador escribe por <span className="font-medium">nombre, NIK o email</span>. Además hay dos
            filtros: <span className="font-medium">Rol</span> (Todos los roles / Admin / Gerente /
            Despachador) y <span className="font-medium">Estado</span> (Todos / Activos / Inactivos).
          </p>

          <h3 className="text-base font-semibold">La lista de usuarios</h3>
          <ul className="ml-5 list-disc space-y-1">
            <li><span className="font-medium">Nombre</span> — el nombre completo de la persona.</li>
            <li>
              <span className="font-medium">NIK</span> — el nombre de usuario con el que esa persona entra
              al sistema. Es único.
            </li>
            <li><span className="font-medium">Email</span> y <span className="font-medium">Telefono</span> — datos de contacto.</li>
            <li>
              <span className="font-medium">Rol</span> — Badge coloreado: <Badge variant="destructive" className="align-middle">Admin</Badge>{" "}
              (rojo), <Badge variant="default" className="align-middle">Gerente</Badge> (oscuro) y{" "}
              <Badge variant="secondary" className="align-middle">Despachador</Badge> (gris).
            </li>
            <li>
              <span className="font-medium">Estado</span> — <Badge variant="success" className="align-middle">Activo</Badge> puede entrar;{" "}
              <Badge variant="secondary" className="align-middle">Inactivo</Badge> no puede iniciar sesión.
            </li>
            <li><span className="font-medium">Acciones</span> — lápiz para editar y papelera para desactivar.</li>
          </ul>

          <h3 className="text-base font-semibold">Crear un usuario</h3>
          <Pasos>
            <FilaPaso>Tocá <span className="font-medium">Nuevo Usuario</span>.</FilaPaso>
            <FilaPaso>
              Completá: <span className="font-medium">Nombre *</span> (el nombre completo),{" "}
              <span className="font-medium">NIK *</span> (cómo va a entrar al sistema),{" "}
              <span className="font-medium">Contraseña *</span>, <span className="font-medium">Email *</span> y{" "}
              <span className="font-medium">Telefono</span> (opcional).
            </FilaPaso>
            <FilaPaso>
              Elegí el <span className="font-medium">Rol *</span>: Admin, Gerente o Despachador.
            </FilaPaso>
            <FilaPaso>
              Dejá marcado el casillero <span className="font-medium">Activo</span> (viene marcado), que es lo
              correcto para una cuenta nueva.
            </FilaPaso>
            <FilaPaso>Tocá <span className="font-medium">Crear Usuario</span>.</FilaPaso>
          </Pasos>
          <p>
            La <span className="font-medium">contraseña</span> tiene reglas: <span className="font-medium">mínimo 8
            caracteres, con al menos 1 mayúscula, 1 número y 1 carácter especial</span>.
            Si no las cumple, el sistema lo avisa.
          </p>

          <h3 className="text-base font-semibold">Editar un usuario (y restablecer contraseña)</h3>
          <p>
            Tocá el lápiz para editar. El formulario abre con los datos actuales y el
            campo de contraseña <span className="font-medium">vacío</span>: si dejás la contraseña vacía, se
            <span className="font-medium">mantiene la actual</span>. Eso te sirve, por ejemplo, para cambiar el
            rol de una persona sin tocar su clave.
          </p>
          <p>
            Para <span className="font-medium">restablecer una contraseña olvidada</span>: editá al usuario,
            escribí la nueva contraseña en el campo "Contraseña (opcional)" y guardá
            con <span className="font-medium">Guardar Cambios</span>. La persona ya puede entrar con la nueva.
          </p>

          <h3 className="text-base font-semibold">Desactivar un usuario</h3>
          <p>
            La papelera no borra la cuenta: la <span className="font-medium">desactiva</span>. El sistema
            pregunta: "¿Estás seguro de que querés desactivar al usuario X? El usuario
            no podrá iniciar sesión pero sus datos se conservan." Al desactivarlo, la
            persona no puede entrar, pero su historial y sus datos siguen intactos.
            Para volver a habilitarlo, editá al usuario y marcá el casillero{" "}
            <span className="font-medium">Activo</span>. El propio sistema impide desactivar tu propia
            cuenta.
          </p>
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/* 7. Stock */}
      {/* ============================================================ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">7. Stock</CardTitle>
          <CardDescription>
            La vista del inventario.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed">
          <p>
            El módulo Stock es la <span className="font-medium">consulta del inventario</span>: un solo
            lugar para ver todos los productos con su stock, su precio y su
            vencimiento.
          </p>

          <h3 className="text-base font-semibold">Filtros y orden</h3>
          <p>Arriba de la tabla tenés muchas herramientas:</p>
          <ul className="ml-5 list-disc space-y-1">
            <li><span className="font-medium">Búsqueda</span> por nombre o código.</li>
            <li>Selector de <span className="font-medium">Rubro</span> ("Todos los rubros" o uno particular).</li>
            <li>
              El botón <span className="font-medium">Archivados</span>: al activarlo cambia la vista y deja
              ver solo los lotes archivados (agotados, vencidos o descartados). En esa
              vista no se puede retirar un lote. Se resalta cuando está activo.
            </li>
            <li>Botón de <span className="font-medium">actualizar</span> y el botón <span className="font-medium">Limpiar filtros</span>.</li>
          </ul>
          <p>
            Para <span className="font-medium">ordenar</span>, tocá el encabezado de una columna: la flechita
            te muestra en qué columna estás ordenando y hacia dónde (sube o baja).
            Tocando de nuevo, invertís el orden. Podés ordenar por código, nombre,
            stock disponible, cantidad de aviso, precio de venta o vencimiento. Por
            defecto viene ordenado por fecha de carga, de lo más nuevo a lo más
            antiguo.
          </p>
          <p>
            La tabla muestra: Código, Nombre, Rubro, Proveedor, Stock Disponible,
            Cant. Aviso, P. Venta, Vencimiento, Estado y Acciones. Abajo tenés la
            paginación con números de página (con puntos suspensivos cuando son muchas).
          </p>

          <h3 className="text-base font-semibold">Cómo leer los estados y avisos</h3>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              <span className="font-medium">Stock bajo (número en azul)</span> — el producto está por debajo
              de su aviso de stock. Conviene reponerlo.
            </li>
            <li>
              <Badge variant="success" className="align-middle">OK</Badge> — el producto está bien: no está vencido
              ni por vencer.
            </li>
            <li>
              <Badge variant="outline" className="align-middle">Por vencer</Badge> — se acerca la fecha de
              vencimiento. Vendelo o fijate qué vas a hacer con él.
            </li>
            <li>
              <Badge variant="destructive" className="align-middle">Vencido</Badge> — ya venció. No debería venderse.
            </li>
          </ul>
          <p>
            Para <span className="font-medium">cargar stock o corregir cantidades</span>, se edita el
            producto desde el módulo <span className="font-medium">Productos</span> (campo "Cantidad en
            Stock"). Este módulo Stock es de lectura y análisis; el botón de lápiz de
            la última columna todavía no tiene función cargada.
          </p>
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/* 8. Administración */}
      {/* ============================================================ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">8. Administración — Cierres de Caja</CardTitle>
          <CardDescription>
            El historial de los períodos cerrados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed">
          <p>
            Cuando se cierra la caja desde Ventas, el período queda archivado acá, en{" "}
            <span className="font-medium">Administración</span>. Es exclusivo de Admin y Gerente.
          </p>

          <h3 className="text-base font-semibold">El listado de cierres</h3>
          <p>
            La lista se ordena por fecha de cierre, del más reciente al más antiguo, e
            incluye el <span className="font-medium">Monto Total</span> y la{" "}
            <span className="font-medium">Cant. Ventas</span> del período. Cada cierre tiene su badge
            de estado <Badge variant="success" className="align-middle">Cerrado</Badge> y un botón de ojo que abre
            su detalle. Con los filtros <span className="font-medium">Fecha Desde</span>/{" "}
            <span className="font-medium">Fecha Hasta</span> acotás la búsqueda por fechas, y{" "}
            <span className="font-medium">Limpiar</span> los quita.
          </p>

          <h3 className="text-base font-semibold">El detalle de un cierre</h3>
          <p>
            Al abrir un cierre ves el encabezado <span className="font-medium">Cierre #xxxxxxxx</span>, con el
            botón <span className="font-medium">Volver a Administración</span> y el botón{" "}
            <span className="font-medium">Exportar CSV</span>.
          </p>
          <p>La tarjeta de resumen muestra:</p>
          <ul className="ml-5 list-disc space-y-1">
            <li><span className="font-medium">Apertura</span> y <span className="font-medium">Cierre</span> — cuándo empezó y cuándo terminó el período.</li>
            <li><span className="font-medium">Usuario apertura</span> y <span className="font-medium">Usuario cierre</span> — quién lo abrió y quién lo cerró.</li>
            <li><span className="font-medium">Monto total</span> — el dinero que quedó en la caja al cerrar.</li>
            <li><span className="font-medium">Estado</span> — el estado del cierre.</li>
          </ul>

          <h4 className="mt-2 mb-1 text-sm font-semibold">La tabla de ventas y sus filtros</h4>
          <p>
            La tabla de ventas tiene una fila por cada producto vendido, con{" "}
            <span className="font-medium">ID Venta</span>, <span className="font-medium">Vendedor</span>,{" "}
            <span className="font-medium">Producto</span>, <span className="font-medium">Cantidad</span> y{" "}
            <span className="font-medium">Monto</span>. Cada venta tiene un color distinto: los productos
            de una misma venta comparten color, así las agrupás de un vistazo.
          </p>
          <p>Podés filtrar con los campos de arriba:</p>
          <ul className="ml-5 list-disc space-y-1">
            <li><span className="font-medium">ID Venta</span> — escribiendo un fragmento del identificador.</li>
            <li><span className="font-medium">Vendedor</span> — por nombre del vendedor.</li>
            <li><span className="font-medium">Producto</span> — por nombre del producto.</li>
            <li><span className="font-medium">Monto Min.</span> y <span className="font-medium">Monto Max.</span> — por el monto de cada línea.</li>
          </ul>
          <p>
            Aplicás los filtros con el botón <span className="font-medium">Buscar</span> (o con Enter) y los
            sacás con <span className="font-medium">Limpiar filtros</span>. También podés ordenar tocando los
            encabezados: "ID Venta", "Cantidad" y "Monto" ordenan desde el sistema, y
            "Vendedor" y "Producto" ordenan en pantalla. Al pie, el "Total Ventas" es
            la suma de los montos que estás viendo: si filtraste, es el total de lo
            filtrado.
          </p>

          <h4 className="mt-2 mb-1 text-sm font-semibold">Ingresos y Egresos del cierre</h4>
          <p>
            Si durante ese período se registraron movimientos de caja, abajo aparece la
            tabla "Ingresos y Egresos" con <span className="font-medium">Fecha</span>,{" "}
            <span className="font-medium">Usuario</span>, <span className="font-medium">Tipo</span> (Ingreso en verde,
            Egreso en rojo) y <span className="font-medium">Monto</span> (los egresos se muestran con signo
            menos). Su pie es la <span className="font-medium">Diferencia Ingresos y Egresos</span>:
          </p>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              <span className="font-medium text-green-600">Diferencia positiva</span> — entró más dinero del que
              salió. Ejemplo típico: un ingreso extra que no vino de una venta.
            </li>
            <li>
              <span className="font-medium text-red-600">Diferencia negativa</span> — salió más dinero del que
              entró. Ejemplo típico: un pago a proveedor hecho desde la caja.
            </li>
          </ul>

          <h4 className="mt-2 mb-1 text-sm font-semibold">El cuadro "Movimientos de Caja"</h4>
          <p>Es el resumen final del cierre, siempre presente:</p>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              <span className="font-medium">Total Ventas</span> — el total vendido en el período. Ojo: este
              número <span className="font-medium">no cambia</span> aunque hayas filtrado la tabla de ventas,
              refleja el total real del período.
            </li>
            <li><span className="font-medium">Diferencia Ingresos/Egresos</span> — la misma diferencia explicada arriba (verde si es positiva, roja si es negativa).</li>
            <li>
              <span className="font-medium">Total</span> (en negrita) — es la suma de las ventas más (o menos)
              la diferencia. Es lo que <span className="font-medium">debería haber quedado en la caja</span> al
              momento del cierre.
            </li>
          </ul>
          <Ejemplo title="Ejemplo para interpretar un cierre">
            <p>
              Un cierre muestra: Total Ventas $212.400,00, Diferencia -$15.000,00
              (porque durante el día se pagó un envío de mercadería desde la caja) y
              Total $197.400,00. Eso significa que, después de las ventas y de ese
              pago, en la caja debería haber $197.400,00. Si al contar el dinero sobra
              o falta, la Diferencia de la caja física ("Positiva"/"Negativa") te va a
              indicar que algo no cerró.
            </p>
          </Ejemplo>

          <h4 className="mt-2 mb-1 text-sm font-semibold">Exportar a CSV</h4>
          <p>
            El botón <span className="font-medium">Exportar CSV</span> descarga un archivo{" "}
            <span className="font-mono text-xs">cierre-xxxxxxxx-ventas.csv</span> con las filas de la tabla
            de ventas <em>tal como las estás viendo</em> (es decir, respetando los
            filtros y el orden aplicados). Ese archivo se abre en Excel, las hojas de
            cálculo o cualquier editor de planillas: es el formato ideal para enviar el
            detalle de un cierre al contador o a la gerencia. Las columnas exportadas
            son: ID Venta, Vendedor, Producto, Cantidad y Monto.
          </p>
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/* 9. Interpretación de la información */}
      {/* ============================================================ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">9. Cómo interpretar la información (resumen)</CardTitle>
          <CardDescription>
            Los colores, los estados y los montos, explicados en un solo lugar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed">
          <h3 className="text-base font-semibold">Qué significan los colores en los montos</h3>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              <span className="font-medium text-green-600">Verde</span> — dinero que entra (ingresos) o
              estados "en orden": un ingreso, una venta completada, un producto activo,
              un stock OK, un cierre cerrado.
            </li>
            <li>
              <span className="font-medium text-red-600">Rojo</span> — dinero que sale (egresos, con signo
              menos) o estados de alerta: una venta cancelada, un producto vencido, una
              cuenta desactivada.
            </li>
            <li>
              <span className="font-medium text-blue-500">Azul</span> — avisos de stock (el stock del producto
              bajó de su aviso) y el número "Total" de un cierre en el cuadro de
              Movimientos de Caja.
            </li>
          </ul>

          <h3 className="text-base font-semibold">Las diferencias, para dummies</h3>
          <p>
            La <span className="font-medium">Diferencia</span> es siempre la misma cuenta:
            <span className="font-medium"> Ingresos menos Egresos</span>.
          </p>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              Que sea <span className="font-medium text-green-600">positiva</span> (verde) significa que entró más
              de lo que salió. En la caja, si al final aparece plata que no viene de las
              ventas (por ejemplo, un ingreso de $10.000 registrado), esa plata suma a
              la diferencia.
            </li>
            <li>
              Que sea <span className="font-medium text-red-600">negativa</span> (roja) significa que salió más de
              lo que entró. Si durante el día se hizo un pago de $15.000 desde la caja,
              esa salida se resta, y la caja cierra con menos plata de la que generaron
              las ventas sola.
            </li>
          </ul>
          <p>
            En el detalle de un cierre, el <span className="font-medium">Total</span> junta las dos cosas:
            <span className="font-medium"> Total = Ventas + Diferencia</span>. Por eso es la cifra que
            tenés que confrontar con el dinero que hay físicamente en la caja cuando
            terminás el día.
          </p>

          <h3 className="text-base font-semibold">Los estados, siempre iguales</h3>
          <p>
            Las <span className="font-medium">ventas</span> pueden estar: "Completada" (verde, cobrada y con
            stock descontado), "Pendiente" (con borde) o "Cancelada" (roja). Las ventas
            que cargás desde la terminal siempre quedan "Completadas"; los otros
            estados aparecen en otras situaciones puntuales.
          </p>
          <p>
            En el <span className="font-medium">historial</span>, la etiqueta de cada fila te dice el tipo de
            registro: "Venta", "Ingreso" o "Egreso". No lo confundas con el estado de
            una venta: acá es el tipo de movimiento.
          </p>
          <p>
            Los <span className="font-medium">productos, rubros y usuarios</span> pueden estar "Activos"
            (verde) o "Inactivos" (gris). Un producto activo solo aparece en la lista
            y puede venderse. Los <span className="font-medium">vencimientos</span> se marcan "OK" (verde),
            "Por vencer" (con borde) o "Vencido" (rojo).
          </p>
          <p>
            Y los <span className="font-medium">cierres de caja</span> se muestran siempre como "Cerrado",
            porque la lista de Administración es justamente el historial de los
            períodos ya cerrados.
          </p>
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/* 10. Consejos de operación diaria */}
      {/* ============================================================ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">10. Consejos de operación diaria</CardTitle>
          <CardDescription>
            Prácticas que hacen la diferencia en el día a día.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed">
          <ul className="ml-5 list-disc space-y-2">
            <li>
              <span className="font-medium">Antes de empezar, revisá el Stock.</span> El listado por defecto
              muestra solo los lotes activos; con el botón "Archivados" vés en un
              segundo los lotes agotados, vencidos o descartados. Así nunca te queda el
              cliente esperando por un producto que no tenés.
            </li>
            <li>
              <span className="font-medium">Usá la cantidad sugerida.</span> Cuando tocás un producto que ya
              se vendió, el carrito carga la misma cantidad de la última venta. Si el
              cliente quiere otra, la ajustás con los botones, sin dramas.
            </li>
            <li>
              <span className="font-medium">Confirmá solo cuando el carrito esté perfecto.</span> Antes de
              tocar "Confirmar Venta", mirá el total y la cantidad de items. Una vez
              confirmada, deshacerla requiere que un Admin o Gerente elimine la venta,
              así que mejor revisar antes.
            </li>
            <li>
              <span className="font-medium">Registrá los movimientos en el momento.</span> Si pagás un
              envío o ponés plata para el vuelto, cargalo en "Ingresos/Egresos" apenas
              pasa. Esos datos son los que hacen que la caja cierre exacta.
            </li>
            <li>
              <span className="font-medium">El stock se descuenta solo.</span> Al vender no tenés que tocar
              nada del inventario: el sistema resta la cantidad automáticamente. Tu
              único trabajo es que el producto esté dado de alta con su stock
              correcto.
            </li>
            <li>
              <span className="font-medium">Definí bien la Unidad de Medida.</span> Un producto cargado como
              "unidad" se cuenta de a uno en el carrito; uno cargado como "kg" se
              cuenta por peso. Si la definición está mal, los conteos se desarman.
            </li>
            <li>
              <span className="font-medium">Usá el aviso de stock.</span> Cargá una "Cantidad Aviso" en los
              productos importantes: cuando el stock se pinte de azul, sabés que hay
              que comprar.
            </li>
            <li>
              <span className="font-medium">Cuando termines el turno, cerrá la caja.</span> El cierre deja
              todo archivado y arranca el nuevo período en limpio. Es el momento de
              contar el dinero y verificar que coincida con el Total del cierre.
            </li>
            <li>
              <span className="font-medium">Sacá tus propias conclusiones diarias.</span> Mirando el Resumen
              del Periodo y el Historial podés responder cosas como "¿cuánto
              vendió cada vendedor?" o "¿qué producto se vende más?". La información
              está ahí, ordenada.
            </li>
            <li>
              <span className="font-medium">Si te apartás de la computadora, cerrá sesión.</span> Una sesión
              abierta es una cuenta abierta: que no quede operando en tu nombre.
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/* Pie */}
      {/* ============================================================ */}
      <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/50 p-4 text-sm text-muted-foreground">
        <Rocket className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Este manual cubre todo lo que podés hacer en el sistema hoy. Si te surge una
          duda, volvé a la sección del módulo que estás usando y seguí el paso a paso.
        </p>
      </div>
    </div>
  );
}