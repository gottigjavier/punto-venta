# cierre-caja min(uuid)

Status: done
Route: direct inline (two already-understood edits) + inline functional verification

## Objective

Fix the production bug that makes every cash-register close return HTTP 500, and close the
test gap that let the bug reach production undetected.

## Problem

`POST /api/v1/ventas/cierre-caja` always fails with 500:

```
prisma:error  Raw query failed. Code: 42883
Message: function min(uuid) does not exist
P2010 -> GET/POST /api/v1/ventas/cierre-caja -> 500
```

`src/application/use-cases/venta.use-case.ts` holds `ORDER BY MIN(d.id)` inside the
`cerrarCaja` transaction (the `agregadosProducto` query added by the EF2 refactor, commit
`b63cc3a`, 2026-09-17). `DetalleVenta.id` is `uuid`, and the `min(uuid)` aggregate does not
exist in PostgreSQL 16. Verified: it fails on the test database and on the development
database (both PG 16.15), and it fails **even with zero rows** because PostgreSQL resolves
the aggregate at plan time. Production is Neon PostgreSQL 16 (`README.md:25`), so the bug is
live. (Neon itself was not probed directly: no credentials.)

Discovered by the first real run of the e2e suite (34 passed / 4 failed).

## Why the concurrency test did not catch it

`src/application/use-cases/cierre-concurrency.test.ts` runs in CI against `postgres:16-alpine`
with `REQUIRE_INTEGRATION_DB=1`. Its `else` branch treated a failed `cerrarCaja` as "the
concurrent delete won the race" and asserted only `venta === null` and `deleteVenta.isOk()`.
Both hold when the close fails with `DATABASE_ERROR`, because the transaction rolled back and
archived nothing, so a database error was accepted as a valid outcome. The second test had the
same gap from the other side: every cierre assertion sat inside `if (resCierre.isOk())`, so a
systematically failing close skipped them all and the test stayed green.

## Scope

In:
- `src/application/use-cases/venta.use-case.ts` - the aggregate cast.
- `src/application/use-cases/cierre-concurrency.test.ts` - reject a database error instead of
  accepting it, in both tests.

Out (explicitly held for a separate decision):
- `tests/e2e/stock.spec.ts:78` `data.producto.id` - contract drift resolved separately by
  aligning the spec (see `odd/tasks/e2e-test-stack.md`, T8). The wire was not touched.

## Chosen fix

`ORDER BY MIN(d.id::text)` - one line, no behaviour change.

Equivalence verified empirically against real rows before applying it: in PostgreSQL a
`uuid` is compared byte-by-byte, and the canonical hex text form has an identical
lexicographic order (lowercase hex digits, hyphens at fixed positions). The harness
`SELECT (...) = (...) AS mismo_orden` comparing `ORDER BY id` against `ORDER BY id::text`
returned `t`.

Rejected alternatives:
- Bumping the image to `postgres:17` would break the existing PG 16 data directory
  (major versions are not forward-compatible), and would not fix any PG 16 deployment.
- Defining a `min(uuid)` aggregate in a migration would work on any version, but it hides a
  bad query behind a database hack instead of fixing the query.

## Tasks

- [x] T1 Apply `MIN(d.id::text)` in `venta.use-case.ts`
- [x] T2 Harden `cierre-concurrency.test.ts` so a `DATABASE_ERROR` from `cerrarCaja` fails the test
- [x] T3 Verify the integration test against a throwaway PostgreSQL 16 (never the dev database)
- [x] T4 Verify end-to-end: rebuild the e2e api image and run the suite

## Acceptance criteria

- The `cerrarCaja` query runs on PostgreSQL 16 (no `42883`). Met.
- The 3 `cierre.spec.ts` e2e tests pass (previously 500). Met.
- The hardened concurrency test fails if `cerrarCaja` returns a database error. Met, by
  deliberate falsification (see T3).
- No source file other than the two in scope is modified. Met.

## Progress

### T1 + T2 (done)

T1: the cast plus a comment explaining why it must not be removed. T2: in the first test the
`else` branch now asserts `resCierre._unsafeUnwrapErr().code === "CONFLICT"`; the second test
gained an `else` with the same assertion. `CONFLICT` is the code the use-case produces for the
only legitimate failure of a close (no open sales: `throw new Error("NO_OPEN_SALES")` at the
`ventasRows.length === 0` guard, translated to `code: "CONFLICT"` in the catch).

### T3 (done, verified)

Throwaway `postgres:16-alpine` container on `127.0.0.1:55432`, own database
`punto_venta_unit`, migrations applied with `prisma migrate deploy`. The development database
was never used: confirmed untouched afterwards (52 usuarios).

- GREEN after the fix: `Test Files 1 passed (1)`, `Tests 3 passed (3)`.
- Falsification (the step that actually proves the hardening works): with the cast removed
  again, the suite FAILED with
  `AssertionError: expected 'DATABASE_ERROR' to be 'CONFLICT'` at the new assertion, alongside
  `42883 function min(uuid) does not exist`. The cast was then restored and verified present
  again. Without this step the green run proved nothing, because at HEAD the test was green too.

### T4 (done, verified)

Rebuilt the `api` image from `api/Containerfile.dev` (compiles to `dist`, so it picks up the
source fix), recreated the e2e database from scratch, brought the stack up and waited for both
migrations and `/health`.

- Suite result: **37 passed / 1 failed (40.6s)**.
- The 3 `cierre.spec.ts` tests pass:
  `✓ 13 cierre.spec.ts:69`, `✓ 14 cierre.spec.ts:122`, `✓ 15 cierre.spec.ts:142`.
- The single remaining failure is `tests/e2e/stock.spec.ts:59` (the out-of-scope contract drift).

## Evidence

- `/tmp/opencode/e2e-run.log` - first real suite run: 34 passed / 4 failed.
- `/tmp/opencode/e2e-run-fix.log` - after the fix: 37 passed / 1 failed.
- `/tmp/opencode/unit-cierre-rotO.log` - falsification run: fails at the new assertion.
- `podman logs pv-api-e2e` - `P2010` / `42883 function min(uuid) does not exist` in the
  `cerrarCaja` transaction.
- `SELECT min(id) FROM "DetalleVenta"` -> error on both the test and the development database.
- `ORDER BY id` == `ORDER BY id::text` harness -> `t`.

## Verification evidence

| Check | Command | Observed |
| --- | --- | --- |
| Integration, GREEN | `vitest run src/application/use-cases/cierre-concurrency.test.ts` | 3 passed / 0 failed |
| Integration, falsified | same, with `::text` removed | fails: `expected 'DATABASE_ERROR' to be 'CONFLICT'` |
| E2E, end to end | `playwright test` against the rebuilt stack | 37 passed / 1 failed |

Not verified: the full `vitest` suite (only the cierre file was run locally, because the local
environment has no database reachable by the whole suite without pointing it at the
development one, which is not acceptable). The CI `test` job remains the full-suite check.

## Next step

Closed. The e2e suite is green (38 passed / 0 failed) after the stock spec alignment
(`odd/tasks/e2e-test-stack.md`, T8). No commits: the user handles version control.
