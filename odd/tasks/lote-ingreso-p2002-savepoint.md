# lote-ingreso-p2002-savepoint

## Objetivo

Arreglar la carrera real que vuelve flaky a `stock-concurrency.test.ts`: el retry
post-P2002 de `loteIngreso` es **imposible** en Postgres porque la transacción ya
quedó abortada cuando el `INSERT` violó el unique index parcial.

## Problema

`loteIngreso` (`src/application/use-cases/stock.use-case.ts:186`) intenta:

1. `mergeLoteForUpdate(tx, ...)` → `SELECT ... FOR UPDATE` (vacío si el lote no existe).
2. `tx.lote.create(...)` (L251) → si dos ingresos concurrentes compiten por la misma
   merge-key, el que pierde recibe **P2002**.
3. El `catch` (L276) reintenta el merge llamando `mergeLoteForUpdate(tx, ...)` **en la
   misma transacción** (L283).

**Por qué está roto:** en Postgres cualquier error de statement aborta la transacción
completa. Todo statement posterior falla con:

```
25P02  current transaction is aborted, commands ignored until end of transaction block
```

Evidencia (corrida real capturada):

```
P2010 → driverAdapterError.cause.originalCode: "25P02"
Invalid `prisma.$queryRaw()` invocation: Raw query failed. Code: 25P02
AssertionError: expected false to be true  → stock-concurrency.test.ts:122:29
```

Resultado: el ingreso perdedor devuelve `DATABASE_ERROR` en vez de absorber el stock.
Es un bug de produccion (perdida de stock visible al usuario), no un artefacto del test.

Nota: `loteEdit` (L649-660) mapea P2002 en el `catch` **externo**, asi que NO tiene este
bug. El patron roto entra en `382d887` ("manejo de concurrencia en db").

## Por que

El usuario pidio encarar el flaky de `stock-concurrency`. El test codifica la intencion
documentada en el propio comentario del codigo (L114-118): "el que pierde recibe P2002 y
reintenta con el merge sobre el lote ya consagrado". La intencion es correcta; la
implementacion no puede funcionar. Ademas, el job `test` de CI ahora si corre (antes
moría en `lint`), asi que este flaky puede poner CI en rojo.

## Alcance

- SI: `src/application/use-cases/stock.use-case.ts` → agregar SAVEPOINT/ROLLBACK TO
  SAVEPOINT alrededor del `tx.lote.create` del camino merge-key.
- SI: verificar RED→GREEN y estabilidad.
- NO: tocar el `ORDER BY` de los locks, ni `venta.use-case.ts`, ni `deleteVenta`.
- NO: cambiar el orden de adquisicion de locks (el SAVEPOINT no toca locks → no abre
  AB-BA con el contrato CO2).
- NO: migraciones ni cambios de schema (el indice parcial ya existe: se crea en
  `20260911171438_unique_lote_mergekey` y CI corre `prisma migrate deploy`).

## Decision de diseno

**SAVEPOINT alrededor del INSERT, `ROLLBACK TO SAVEPOINT` en el catch de P2002.**

Alternativas evaluadas y descartadas:

1. **`INSERT ... ON CONFLICT DO NOTHING` + merge** — funciona, pero reemplaza
   `tx.lote.create` por SQL crudo, pierde el `include: loteInclude` (habria que hacer un
   SELECT extra) y es un diff mas grande en el camino critico de stock. Rechazada por
   costo/riesgo.
2. **Lockear `Producto` (padre) antes de leer/crear** — serializa todos los ingresos del
   producto y, sobre todo, **invierte el orden de locks** de (Lote → Producto) a
   (Producto → Lote), que es exactamente la clase de deadlock AB-BA que el codigo protege
   deliberadamente (contrato CO2 en `deleteVenta`). Rechazada.
3. **Reintentar la transaccion completa desde afuera** — cambia la semantica de error y
   arriesga reintentar fallos genuinos. Rechazada.

El SAVEPOINT es quirurgico: no toca locks, no toca el calculo de dinero (`aplicarMerge`
sigue siendo la unica fuente de verdad del promedio ponderado), y el camino feliz paga
solo 1-2 statements extra sobre una operacion de ingreso manual (no hot path).

## Tareas

- [x] T1 — Reproducir el fallo con salida completa y diagnosticar la causa raiz.
- [x] T2 — Aplicar el fix de SAVEPOINT en `loteIngreso`.
- [x] T3 — Verificar RED→GREEN con corridas repetidas (estabilidad).
- [x] T4 — Suite completa con `REQUIRE_INTEGRATION_DB=1` + `tsc --noEmit` + `lint`.
- [x] T5 — Arreglar la deriva del mock `tx` en `stock.use-case.test.ts` que exponía el fix.

## Ruta de implementacion

- T1: inline (diagnostico; comando acotado).
- T2: **inline** (1 archivo de produccion, diseno ya resuelto, sin investigacion pendiente).
- T3/T4: inline (verificacion ejecutable; el padre corre los comandos).

## Criterios de aceptacion

1. `P2002` deja de propagarse como `DATABASE_ERROR`: el ingreso perdedor hace merge y
   devuelve `ok` con `esNuevo: false`.
2. `stock-concurrency.test.ts` pasa de forma estable (10/10 corridas aisladas).
3. Un solo lote final, `cantidad_disponible = 30`, `precio_compra = 100`.
4. Suite completa verde + `tsc` + `lint` en 0.
5. Cero cambios en el orden de locks y en el calculo de dinero.

## Verificacion

| Check | Comando | Resultado |
| --- | --- | --- |
| RED (antes) | `REQUIRE_INTEGRATION_DB=1 npx vitest run .../stock-concurrency.test.ts` | FALLA 1/1: P2002 → 25P02 → `expected false to be true` (L122) |
| GREEN (despues) | idem, 10 corridas | **10 PASS / 0 FAIL**; las 10 ejercitaron el retry post-P2002 |
| Suite | `REQUIRE_INTEGRATION_DB=1 npm run test:run` | **exit 0 — 21 files, 296 passed** |
| Tipos | `npx tsc --noEmit` | **exit 0** |
| Lint | `npm run lint` | **exit 0** |

El retry se ejercito en 10/10 corridas (linea de log "Merge post-P2002 por ingreso
concurrente"), asi que el verde es **causal**: el test recorre exactamente el camino que
antes estaba roto. Si alguien revierte el SAVEPOINT, el test vuelve a fallar.

## Hallazgo colateral (T5)

El fix expuso deriva del mock en `src/__tests__/application/use-cases/stock.use-case.test.ts`:
`vi.mock` reemplaza `prisma` y `mockPrisma.$transaction` ejecuta el callback pasando
`mockPrisma` como `tx`, que no tenia `$executeRaw`. Los 3 tests mockeados de `loteIngreso`
pasaban de verde a rojo con `expected false to be true` (el TypeError se convertia en
DATABASE_ERROR). Se agrego el stub `$executeRaw: vi.fn()` (3 lineas). Es la misma clase de
deriva que tenian los 7 tests mockeados de `venta` (allá se prefirio migrar a integracion;
aca el stub alcanza porque la deriva es un unico metodo).

## Criterios de aceptacion — estado

1. OK — el perdedor hace merge y devuelve `ok` con `esNuevo: false`.
2. OK — 10/10 corridas aisladas verdes (antes 4/5 rojas).
3. OK — 1 lote final, `cantidad_disponible = 30`, `precio_compra = 100`.
4. OK — suite 296/296, `tsc` 0, `lint` 0.
5. OK — cero cambios de locks y de calculo de dinero (el diff solo agrega 3 statements
   de manejo de transaccion).

## Verificacion de riesgo (gate de delegacion, RDD off)

`gentle-ai review assess --cwd . --agent opencode --untracked-scope=exclude
--expected-untracked-inventory=sha256:6bb6e746...` → `risk: medium`,
`executable_change`, 17 lineas, `review_due: false` (`under_budget`).
Medium sin perfil de modelo chico → alcanza la autoverificacion del escritor + spot check
del padre (contrato de verificacion delegada). No se inicia review nativo: RDD esta **off**
para este clon.

## Evidencia

- Fallo completo crudo: `/tmp/opencode/stockfail.log`.
- Indice real en DB: `Lote_merge_key_unique UNIQUE btree (producto_id, numero_lote,
  fecha_vencimiento) WHERE numero_lote IS NOT NULL`.
- Introducido por: `382d887 menjo de concurrencia en db`.

## Proximo paso

Commiteado por el usuario (el agente no commitea). Working copy listo con los 2 archivos
modificados + este doc. Mensaje sugerido:

```
fix(stock): recuperar la transacción tras el P2002 en loteIngreso con SAVEPOINT
```

## Riesgo residual declarado

El cambio agrega 3 statements (SAVEPOINT / RELEASE / ROLLBACK TO SAVEPOINT) en el camino
"crear lote nuevo con merge-key". La unica superficie de fallo nueva seria que el motor no
soportara SAVEPOINT: no es el caso — Postgres 16 y Neon soportan SAVEPOINT nativamente, y
esta probado contra Postgres real (el ganador de la carrera recorre
SAVEPOINT→create→RELEASE y commitea OK). El camino `numero_lote NULL` y el camino
"lote ya existe" no se tocan.

Mejora adicional de comportamiento: si el P2002 viniera de otro unique constraint, ahora
se propaga el error original en vez de enmascararlo con 25P02.
