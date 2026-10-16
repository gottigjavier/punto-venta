# e2e test stack

Status: in progress
Route: delegated direct (one writer per work unit)

## Objective

Give the `e2e` CI job a stack it can actually run against: a dedicated, self-contained
compose stack with its own throwaway database, and automatic provisioning of the users
the specs log in as.

## Problem

The `e2e` job in `.github/workflows/ci.yml` has **never executed successfully** (it was
added by the previous session and the compose discovery bug killed it before any test
ran). Four independent defects sit behind it:

1. `podman compose` without `-f` did not discover the compose file. Already fixed by
   renaming `podman-compose.yml` -> `compose.yaml` (kept).
2. On a fresh database there are **zero users**, so every `api.login()` returns
   401 `INVALID_CREDENTIALS` and every spec fails at its first step. There is no seed
   (deleted on purpose, decision DV2 in `scripts/deploy.sh`) and none is wanted.
3. The health-wait step cannot fail (`.github/workflows/ci.yml:146-153` has no `exit 1`),
   so an unhealthy stack is reported as healthy.
4. `tests/e2e/auth.spec.ts:117-119` expects `423 ACCOUNT_LOCKED`, but login returns a
   uniform `401 INVALID_CREDENTIALS` for locked accounts on purpose
   (`src/application/use-cases/auth.use-case.ts:67-70`, S4 hardening). The spec is stale.

## Why a dedicated stack (not an override, not per-entity cleanup)

- **No override**: an override silently depends on `compose.yaml`'s content; a dedicated
  file is self-contained and legible, and matches the repository's existing pattern
  (`podman-compose.prod.yml` is a dedicated file always invoked with `-f`).
- **No per-entity cleanup**: API-only cleanup is impossible. Verified:
  `cierre de caja` has no DELETE endpoint at all, `producto` is soft-delete only, and
  `rubro`/`proveedor` refuse deletion while any producto references them (and producto
  rows never disappear) -> permanent residue. FK-dependent manual ordering is fragile.
  A throwaway database removes the whole problem class instead of fighting it.
- **No seed**: provisioning goes through the real API (`bootstrap` + `POST /usuarios`),
  which is also what the specs exercise.

## Scope

In:
- `compose.test.yaml` (new) - the dedicated e2e stack.
- `.github/workflows/ci.yml` - the `e2e` job only.
- E2E provisioning fixture + `playwright.config.ts` wiring.
- `tests/e2e/auth.spec.ts` - the stale lockout expectation.
- `scripts/test-e2e.sh` (new, local DX) - optional last.

Out:
- `podman-compose.prod.yml`, `scripts/prod.sh`, `scripts/deploy.sh` (prod path untouched).
- Application source: no new endpoints, no domain change.
- Anything that reaches Vercel / Render / Neon.

## Constraints

- Must not affect the Vercel, Render or Neon deployments. Nothing in this plan touches them:
  Render builds from source (`render.yaml`), Vercel rewrites `/api/v1/*` to the Render host
  (`client/vercel.json`), Neon is only the database.
- No user seed, ever.
- User handles version control (JJ). No commits from the agent.
- Generated artifacts in English.

## Design decisions

- D1: dedicated `compose.test.yaml`, always invoked with an explicit `-f` (not
  auto-discovered, exactly like the prod file).
- D2: the test database is NOT published to the host (the specs are HTTP-only, nothing on
  the host talks to it) and uses its own volume, discarded by `down -v`.
- D3: distinct container names (`*-e2e`) so the stack can coexist with the dev pod.
- D4: the `api` service runs the image CMD (`node dist/main.js`, compiled code), with no
  host source mount. The image already ships `dist/` and the prisma CLI
  (`api/Containerfile.dev`), so the stack is self-contained.
- D5: `RATE_LIMIT_ENABLED=false` explicitly. The limiter is not registered outside
  production/staging anyway, and this makes the value immune to future NODE_ENV changes.
  Keep `MAX_LOGIN_ATTEMPTS=3` and `LOCKOUT_DURATION_MINUTES=30` (the lockout is DB-driven,
  independent of the limiter, and `auth.spec.ts` depends on it).
- D6: a one-shot `migrate` service (parity with `compose.yaml`, proven) instead of the
  job's `exec ... migrate deploy`, because the `api` container has no `prisma.config.ts`
  mount (Prisma 7 reads it for `datasource.url`, and `Containerfile.dev` does not COPY it).
- D7: no `client` service. Every spec is API-only.

## Tasks

- T1 - `compose.test.yaml`: db (`punto_venta_e2e`, no host port, own volume), `migrate`
  one-shot, `api` on 3001. Deps: none.
  Check: `podman compose -f compose.test.yaml config --services` lists `db migrate api`.
- T2 - `.github/workflows/ci.yml` `e2e` job: explicit `-f compose.test.yaml` on every call;
  health-wait that actually fails after N attempts; remove the redundant exec migrate.
  Deps: T1.
  Check: workflow parses; every compose call names the file.
- T3 - provisioning fixture: `bootstrap` the first admin when available, then create
  `gerente` + `despachador` through `POST /api/v1/usuarios` as that admin. Idempotent
  (skip when users already exist). Deps: none.
- T4 - `playwright.config.ts`: wire the fixture as `globalSetup`. Deps: T3.
  Check: `npx playwright test --list` still works.
- T5 - `tests/e2e/auth.spec.ts`: the lockout test asserts the hardened contract - while
  locked, the CORRECT password is still refused (`401`), then the admin unlock lets it
  through. Deps: none.
- T6 - real run: build + up + migrate + `playwright test` against the test stack.
  Deps: T1-T5. This is the only real proof.
- T7 - `scripts/test-e2e.sh` (local DX wrapper: build/up/wait/test/down -v). Optional.

## Acceptance criteria

- `podman compose -f compose.test.yaml config` is valid and lists only `db migrate api`.
- The `e2e` job names its compose file explicitly on every call and fails loudly when the
  stack never becomes healthy.
- A fresh test database is provisioned automatically, without a seed, through the real API.
- No change to the Vercel/Render/Neon path.

## Progress

- [x] Recon: existing suite, compose files, CI job, delete capability, rate limits.
- [x] T1 `compose.test.yaml`. Includes `name: punto-venta-e2e`, which turned out to be
  indispensable: without it the project name derives from the directory and the test stack
  shares the `punto-venta_default` network with the dev stack, where the network alias comes
  from the SERVICE name (`db`) rather than the `container_name`, so the test API silently
  talked to the development database (`database punto_venta_e2e does not exist`).
  Distinct `container_name`s do NOT isolate stacks.
- [x] T2 `e2e` job with `-f compose.test.yaml` and a health-wait that fails.
- [x] T3 provisioning fixture via the real API. Proven in the first real run:
  `[global-setup] Provisioned users: admin, gerente, despachador.`
- [x] T4 `globalSetup` wired.
- [x] T5 lockout spec rewritten to the hardened contract (uniform `401`, no `423`).
- [x] T6 real run. First execution: **34 passed / 4 failed**. The 4 failures were two real
  findings, both resolved:
  - 3 x `cierre.spec.ts` - a live production bug. `POST /api/v1/ventas/cierre-caja` returned
    500 (`42883 function min(uuid) does not exist`) because `cerrarCaja` used
    `ORDER BY MIN(d.id)` on a uuid column and `min(uuid)` does not exist in PostgreSQL 16.
    Fixed and verified; see `odd/tasks/cierre-caja-min-uuid.md`.
  - 1 x `stock.spec.ts:59` - contract drift, resolved by aligning the spec (T8).
- [ ] T7 `scripts/test-e2e.sh` local DX wrapper. Still optional and not written.
- [x] T8 align `stock.spec.ts` to the implemented wire shape. `stock.spec.ts:78` asserted
  `data.producto.id`, but the ingreso response is the lean `Lote` wire schema
  (`response.dto.ts`), which does not declare `producto`/`rubro`/`proveedor`; Fastify drops
  them silently. Aligned the assertion to `data.producto_id` (the field the wire actually
  carries, same intent) and removed the same lie from the `LoteResponse` fixture, which
  declared a `producto` block no endpoint of that type returns. The wire was NOT changed:
  Vercel/Render consume it.

## Final state

- Suite: **38 passed / 0 failed** (`npx playwright test` against the real stack). The e2e job
  can now execute and it is able to fail for a real reason.
- Two verified work units: the production fix (`cierre-caja-min-uuid.md`) and the spec
  alignment. Both uncommitted: the user handles version control.

## Next step

Optionally write T7. Commit the pending work (user's call).
