// tests/e2e/global-setup.ts
// Playwright global setup: provisions the users the specs log in as.
//
// On a fresh e2e database there are zero users, so every api.login() would fail
// with 401. There is deliberately no seed: provisioning goes through the real
// HTTP API (bootstrap + POST /api/v1/usuarios), which is also what the specs
// exercise.
//
// Idempotent: if the database already has users, bootstrap is unavailable and
// provisioning is skipped with a log line, so a reused database is not
// double-provisioned.
import { ApiClient, TEST_USERS } from "../fixtures/test-data.js";
import type { LoginResponse } from "../fixtures/test-data.js";

const API_URL = process.env.API_URL || "http://localhost:3001";

function provisioningFailed(
  step: string,
  status: number,
  body: unknown,
): never {
  throw new Error(
    `[global-setup] Provisioning failed at "${step}": HTTP ${status} ` +
      `${JSON.stringify(body)}. Every spec would fail with a confusing 401 login error.`,
  );
}

export default async function globalSetup(): Promise<void> {
  const api = new ApiClient(API_URL);

  // 1. Ask the API whether the first admin can be created.
  //    GET /api/v1/auth/bootstrap-status -> { success, data: { needsBootstrap } }
  let statusRes;
  try {
    statusRes = await api.request<{ needsBootstrap: boolean }>(
      "GET",
      "/api/v1/auth/bootstrap-status",
    );
  } catch (error) {
    throw new Error(
      `[global-setup] Could not reach the API at ${API_URL} ` +
        `(GET /api/v1/auth/bootstrap-status): ${String(error)}`,
    );
  }

  if (statusRes.status !== 200 || !statusRes.body.success) {
    provisioningFailed(
      "GET /api/v1/auth/bootstrap-status",
      statusRes.status,
      statusRes.body,
    );
  }

  const statusData = statusRes.body.data;
  if (!statusData) {
    provisioningFailed(
      "GET /api/v1/auth/bootstrap-status (missing data)",
      statusRes.status,
      statusRes.body,
    );
  }

  if (!statusData.needsBootstrap) {
    console.log(
      "[global-setup] The database already has users; skipping provisioning (idempotent).",
    );
    return;
  }

  // 2. Bootstrap the first admin. This endpoint hardcodes the admin role, so it
  //    must be the first user created and cannot provision other roles.
  const bootstrapRes = await api.request<LoginResponse>(
    "POST",
    "/api/v1/auth/bootstrap",
    {
      nombre_usuario: TEST_USERS.admin.nombre_usuario,
      nik_usuario: TEST_USERS.admin.nik_usuario,
      email: TEST_USERS.admin.email,
      password: TEST_USERS.admin.password,
    },
  );

  if (bootstrapRes.status !== 200 || !bootstrapRes.body.success) {
    provisioningFailed(
      "POST /api/v1/auth/bootstrap",
      bootstrapRes.status,
      bootstrapRes.body,
    );
  }

  const bootstrapData = bootstrapRes.body.data;
  if (!bootstrapData) {
    provisioningFailed(
      "POST /api/v1/auth/bootstrap (missing data)",
      bootstrapRes.status,
      bootstrapRes.body,
    );
  }

  api.setToken(bootstrapData.accessToken);

  // 3. Create the remaining roles as the bootstrapped admin.
  //    POST /api/v1/usuarios -> 201 { success, data: Usuario }
  for (const user of [TEST_USERS.gerente, TEST_USERS.despachador]) {
    const createdRes = await api.request("POST", "/api/v1/usuarios", {
      nombre_usuario: user.nombre_usuario,
      nik_usuario: user.nik_usuario,
      password: user.password,
      email: user.email,
      rol: user.rol,
      activo: true,
    });

    if (createdRes.status !== 201 || !createdRes.body.success) {
      provisioningFailed(
        `POST /api/v1/usuarios (${user.nik_usuario})`,
        createdRes.status,
        createdRes.body,
      );
    }
  }

  console.log(
    "[global-setup] Provisioned users: admin, gerente, despachador.",
  );
}
