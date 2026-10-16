# Tareas ODD — venta-fefo-integracion

- **Feature**: `venta-fefo-integracion`
- **Creado**: 2026-10-16 | **Cerrado**: 2026-10-16
- **Repo**: `/home/javier/programacion/punto-venta`
- **Autorizacion explicita del usuario**: "Arreglar FEFO y portar en verde (Recomendado)".
- **TDD efectivo**: **NO habilitado**. Fuente: la observacion `sdd-init/punto-venta` (engram #191) no contiene `strict_tdd` ni seccion de testing, y no hay eleccion explicita. Regla aplicada: la presencia de Vitest no habilita TDD. Se adopto igualmente el orden RED -> GREEN como evidencia observable.
- **Runner**: `npx vitest run` / `npm run test:run`. Integracion: `REQUIRE_INTEGRATION_DB=1` + Postgres en `localhost:5432`.
- **RDD**: `off` (decidido por `clone_local`; global `on`). No se inicio revision nativa.
- **Tier nativo** (`gentle-ai review assess`, untracked declarado): `medium`, razon `executable_change`, 1095 lineas cambiadas, `review_due: false` (`under_budget`). Con RDD off el tier medium se cubre con autoverificacion del writer + spot check del padre (ambos ejecutados).
- **Commits**: **user-owned** (instruccion explicita del usuario: "Lo manejo yo"). Nada commiteado por el agente.

## Objetivo

Recuperar el consumo FEFO en `createVenta` y reemplazar 7 tests con mocks que ya no verificaban nada por tests de integracion contra Postgres real. **Ambos objetivos cumplidos.**

## Problema (verificado)

Regresion de `382d887` (2026-09-11, "manejo de concurrencia en db"): al reemplazar el `findMany` de Prisma por SQL crudo con `FOR UPDATE` se perdio `orderBy: [{ fecha_vencimiento: 'asc' }, { created_at: 'asc' }]`. La query quedo con `ORDER BY producto_id, id` (`id` = UUID v4 → orden aleatorio) y el unico reordenamiento en memoria movia los `NULL` al final. El comentario de cabecera del archivo afirmaba FEFO: documentacion que mentia.

## Decision de implementacion (cambio de plan respecto del primer borrador)

El plan inicial era recuperar FEFO en el `ORDER BY` del SQL. **Descartado con evidencia**: `deleteVenta` (`venta.use-case.ts:784-809`) lockea los lotes con la MISMA clave `ORDER BY producto_id, id`, y su comentario declara el contrato explicito de CO2: *"ambos toman los locks de lote en el mismo orden (se evitan deadlocks nuevos entre deleteVenta y createVenta)"*. Cambiar el `ORDER BY` solo en `createVenta` habria roto ese contrato (deadlock AB-BA entre ambas transacciones). Ademas `fecha_vencimiento` es **mutable**, por lo que no debe decidir el orden de adquisicion de locks; `id` si es inmutable.

**Fix aplicado**: orden FEFO **en memoria**, SQL de lock intacto.
- Helper `compararFEFO()` a nivel de modulo: `fecha_vencimiento` ASC con los sin-vencimiento al final, desempate por `created_at` y luego por `id` (orden total determinista).
- El bloque que antes solo particionaba los `NULL` (`venta.use-case.ts:203-206`) ahora hace `[...lotesRaw].sort(compararFEFO)`.
- Comentarios del lock actualizados para documentar el contrato y evitar que un futuro lector "arregle" el SQL y reintroduzca el deadlock.

## Alcance

**Dentro** (completado): fix FEFO en `createVenta`; 7 tests de integracion reales; retiro de los 7 tests mocked.
**Fuera**: `deleteVenta` y demas use cases; schema/migraciones; el flaky de `stock-concurrency` (ver Hallazgos); cambios de despliegue.

## Criterios de aceptacion — resultado

1. `createVenta` ordena FEFO dentro de cada producto conservando el orden global determinista de locks. **CUMPLIDO**.
2. Los 7 comportamientos cubiertos contra Postgres real y pasando. **CUMPLIDO** (8 tests: 7 casos + prereq).
3. Suite completa verde; `tsc --noEmit` y `lint` sin errores. **CUMPLIDO**.
4. Los 7 tests mocked retirados (sin cobertura duplicada divergente). **CUMPLIDO**.

## Tareas y evidencia

### T1 — Archivo de integracion (COMPLETADO, delegado)
- `src/application/use-cases/venta-fefo.test.ts` — 7 casos + test `[prereq]`. Ubicacion: junto a los 3 tests de integracion reales existentes; `vitest.config.ts` incluye `src/**/*.test.ts` y `tsconfig.json` excluye `**/*.test.ts` del build.
- Determinismo del caso FEFO: ids UUID sembrados con orden lexicografico **inverso** al FEFO correcto (verificado contra la DB), para que falle SIEMPRE con el codigo viejo y pase SIEMPRE con el fix. L2/L3 con misma `fecha_vencimiento` y `created_at` distinto → ejercita el desempate.
- Fechas relativas al `now()` real (`+1d`, `+3d`, `+30d`, `-3d`, `null`); sin fake timers. Se uso `-3d` para el vencido porque `-1d` resulto flaky por `limiteHoy()` en UTC-3.
- **Evidencia RED** (antes del fix): `Tests 1 failed | 7 passed (8)` — `AssertionError: expected { …(3) } to deeply equal { …(2) }` en `venta-fefo.test.ts:289`; fallo 3/3 corridas consecutivas.

### T2 — Retiro de los tests mocked (COMPLETADO, delegado)
- `src/__tests__/application/use-cases/venta.use-case.test.ts`: borradas las lineas 202-664 (1104 -> 588 lineas). Conservados `producto no encontrado → NOT_FOUND` y `transaction fails → DATABASE_ERROR` y el resto del archivo.
- Evidencia: `npx vitest run` sobre ese archivo -> `21 passed`.

### T3 — Fix FEFO (COMPLETADO, inline)
- `src/application/use-cases/venta.use-case.ts`: `compararFEFO()` + `[...lotesRaw].sort(compararFEFO)` + comentarios del lock. SQL de `lotesBloqueados` sin cambios.
- **Evidencia GREEN**: `REQUIRE_INTEGRATION_DB=1 npx vitest run src/application/use-cases/venta-fefo.test.ts` -> **`8 passed (8)`** (el mismo archivo que estaba 1 failed).

### T4 — Verificacion final (COMPLETADO)
| Comando | Resultado observado |
| --- | --- |
| `REQUIRE_INTEGRATION_DB=1 npx vitest run src/application/use-cases/venta-fefo.test.ts` | **8 passed** |
| `npx vitest run src/__tests__/application/use-cases/venta.use-case.test.ts` | **21 passed** |
| `REQUIRE_INTEGRATION_DB=1 npx vitest run src/application/use-cases/{venta,cierre}-concurrency.test.ts` | **5 passed** (contrato de locks intacto) |
| `REQUIRE_INTEGRATION_DB=1 npm run test:run` | **exit 0 — 21 files, 296 passed** |
| `npx tsc --noEmit` | **exit 0** |
| `npm run lint` | **exit 0** |

## Hallazgos colaterales (no parte del alcance)

1. **`stock-concurrency.test.ts` es flaky y pre-existente**: falla 4 de 5 corridas en solitario (`expected [true, true] to have a length of 1`; asercion en L122) y paso en la suite completa y en CI. Testea `loteIngreso` (carrera P2002 mismo merge-key en `stock.use-case.ts`), **no** `createVenta`: con un solo lote mi `compararFEFO` es un no-op, por lo que este trabajo no puede haberlo causado. Riesgo directo al objetivo de "CI siempre verde".
2. **`eslint` NO cubre `src/__tests__/**`** y tiene `no-unused-vars: off`: los imports/vars sin usar en tests no los detecta el lint.
3. **`tsc` excluye los tests** (`**/*.test.ts`), y Vitest usa esbuild (sin typecheck): **ningun test del repo esta type-checkeado** por CI. Los 45 errores de tipo preexistentes del archivo unitario no se ven en el pipeline.

## Entrega

- Diff: **1095 lineas cambiadas** (`review assess`), de las cuales ~521 son borrado de tests obsoletos y el resto el archivo nuevo + el fix.
- El cambio es **atomico**: el test FEFO es ROJO sin el fix (T3), por lo que T1 y T3 no deben separarse en PRs distintos sin dejar un estado en rojo o una cobertura falsa.
- **DECIDIDO por el usuario (2026-10-16)**: un solo PR / un solo work-unit. El agente **no commitea** (VCS del usuario); deja el working copy listo.
- Mensaje de commit sugerido (conventional, en español, sin atribucion de IA):

  `fix(ventas): restaurar el consumo FEFO en createVenta y cubrirlo con tests de integracion`

## Proximo paso

- **Cerrado**: no queda trabajo pendiente en esta feature.
- Pendiente propuesto (cambio separado): el flaky de `stock-concurrency` (`loteIngreso`, carrera P2002 sobre la merge-key). Ataca directamente el objetivo "CI siempre verde".
- Pendiente menor de higiene: `eslint` no cubre `src/__tests__/**` y los tests no estan type-checkeados (`tsc` los excluye).
