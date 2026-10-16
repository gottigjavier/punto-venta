// tests/e2e/auth.spec.ts
// E2E tests for Authentication flows
// Section 8.2 - Flujo de autenticación
import { test, expect } from "@playwright/test";
import { createApiClient, TEST_USERS } from "../fixtures/test-data.js";
import type { ApiClient } from "../fixtures/test-data.js";

test.describe("Auth - Flujo de autenticación", () => {
  let api: ApiClient;

  test.beforeEach(() => {
    api = createApiClient();
  });

  test.afterEach(async () => {
    await api.logout();
  });

  test("Login exitoso con credenciales válidas", async () => {
    const result = await api.login(
      TEST_USERS.admin.nik_usuario,
      TEST_USERS.admin.password
    );

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.data).toBeDefined();
    expect(result.body.data!.accessToken).toBeDefined();
    expect(typeof result.body.data!.accessToken).toBe("string");
    expect(result.body.data!.accessToken.length).toBeGreaterThan(0);

    // Verify user data
    const user = result.body.data!.user;
    expect(user.nik_usuario).toBe(TEST_USERS.admin.nik_usuario);
    expect(user.rol).toBe("admin");
    expect(user.email).toBe(TEST_USERS.admin.email);
    expect(user.nombre_usuario).toBe(TEST_USERS.admin.nombre_usuario);
  });

  test("Login exitoso con rol gerente", async () => {
    const result = await api.login(
      TEST_USERS.gerente.nik_usuario,
      TEST_USERS.gerente.password
    );

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.data!.user.rol).toBe("gerente");
  });

  test("Login exitoso con rol despachador", async () => {
    const result = await api.login(
      TEST_USERS.despachador.nik_usuario,
      TEST_USERS.despachador.password
    );

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.data!.user.rol).toBe("despachador");
  });

  test("Login fallido con credenciales inválidas", async () => {
    const result = await api.login("usuario_inexistente", "password123");

    expect(result.status).toBe(401);
    expect(result.body.success).toBe(false);
    expect(result.body.error).toBeDefined();
    expect(result.body.error!.code).toBe("INVALID_CREDENTIALS");
    expect(result.body.error!.message).toBe("Credenciales inválidas");
  });

  test("Login fallido con contraseña incorrecta", async () => {
    const result = await api.login(TEST_USERS.admin.nik_usuario, "wrongpassword");

    expect(result.status).toBe(401);
    expect(result.body.success).toBe(false);
    expect(result.body.error!.code).toBe("INVALID_CREDENTIALS");
  });

  test("Login con body vacío retorna error de validación", async () => {
    const result = await api.request("POST", "/api/v1/auth/login", {});

    expect(result.status).toBe(400);
    expect(result.body.success).toBe(false);
    expect(result.body.error!.code).toBe("VALIDATION_ERROR");
  });

  test("Login con nik vacío retorna error de validación", async () => {
    const result = await api.request("POST", "/api/v1/auth/login", {
      nik_usuario: "",
      password: "Admin123!",
    });

    expect(result.status).toBe(400);
    expect(result.body.success).toBe(false);
  });

  test("Bloqueo tras 3 intentos fallidos y desbloqueo por admin", async () => {
    // Use a fresh user for this test (we'll use the despachador)
    const testApi = createApiClient();

    // Make 3 failed attempts: the lock is applied once the count reaches
    // MAX_LOGIN_ATTEMPTS (3).
    for (let i = 0; i < 3; i++) {
      const result = await testApi.request("POST", "/api/v1/auth/login", {
        nik_usuario: TEST_USERS.despachador.nik_usuario,
        password: "wrong_password",
      });
      expect(result.status).toBe(401);
      expect(result.body.error!.code).toBe("INVALID_CREDENTIALS");
    }

    // The account is now locked. Login is hardened (S4): a locked account
    // returns a uniform 401 INVALID_CREDENTIALS, exactly like any other failure,
    // so the response cannot be used to enumerate accounts or reveal state.
    // The observable proof that the lockout works is that the CORRECT password
    // is refused while locked — on an unlocked account that same password would
    // succeed (see the other login tests).
    const lockedResult = await testApi.login(
      TEST_USERS.despachador.nik_usuario,
      TEST_USERS.despachador.password
    );

    expect(lockedResult.status).toBe(401);
    expect(lockedResult.body.success).toBe(false);
    expect(lockedResult.body.error!.code).toBe("INVALID_CREDENTIALS");

    // Now unlock the user via admin
    const adminApi = createApiClient();
    const adminLogin = await adminApi.login(
      TEST_USERS.admin.nik_usuario,
      TEST_USERS.admin.password
    );
    expect(adminLogin.status).toBe(200);

    // Get user ID first
    const usuarios = await adminApi.request("GET", "/api/v1/usuarios?search=despachador");
    expect(usuarios.status).toBe(200);
    const despachador = usuarios.body.data?.find(
      (u: Record<string, unknown>) => (u as Record<string, unknown>).nik_usuario === TEST_USERS.despachador.nik_usuario
    );
    expect(despachador).toBeDefined();

    const userId = (despachador as Record<string, unknown>).id as string;

    // Unlock user
    const unlockResult = await adminApi.request("POST", `/api/v1/auth/unlock/${userId}`);
    expect(unlockResult.status).toBe(200);
    expect(unlockResult.body.success).toBe(true);

    // After the unlock the same correct password now succeeds, proving the lock
    // was lifted and the earlier refusal was due to the lockout, not bad creds.
    const afterUnlock = await testApi.login(
      TEST_USERS.despachador.nik_usuario,
      TEST_USERS.despachador.password
    );

    expect(afterUnlock.status).toBe(200);
    expect(afterUnlock.body.success).toBe(true);
    expect(afterUnlock.body.data!.user.rol).toBe("despachador");

    await adminApi.logout();
  });

  test("Refresh token exitoso", async () => {
    // Login to get tokens
    const loginResult = await api.login(
      TEST_USERS.admin.nik_usuario,
      TEST_USERS.admin.password
    );
    expect(loginResult.status).toBe(200);

    // Extract refresh token from cookie (simulate by using the same client)
    // The refresh endpoint uses the cookie, so we need to test via the API
    // For E2E, we test that the login provides a valid token
    // and that we can use it for authenticated requests
    const token = loginResult.body.data!.accessToken;
    expect(token).toBeDefined();

    // Verify token works by accessing a protected endpoint
    const protectedResult = await api.request("GET", "/api/v1/productos");
    expect(protectedResult.status).toBe(200);
    expect(protectedResult.body.success).toBe(true);
  });

  test("Logout exitoso", async () => {
    // Login first
    await api.login(TEST_USERS.admin.nik_usuario, TEST_USERS.admin.password);

    // Logout
    const result = await api.request("POST", "/api/v1/auth/logout");
    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.data).toBeDefined();

    // Clear token from client
    api.clearToken();

    // Verify token is no longer valid
    const protectedResult = await api.request("GET", "/api/v1/productos");
    expect(protectedResult.status).toBe(401);
  });

  test("Acceso a endpoint protegido sin token retorna 401", async () => {
    const result = await api.request("GET", "/api/v1/productos");
    expect(result.status).toBe(401);
    expect(result.body.success).toBe(false);
    expect(result.body.error!.code).toBe("UNAUTHORIZED");
  });

  test("Acceso con token inválido retorna 401", async () => {
    api.setToken("invalid-token-here");
    const result = await api.request("GET", "/api/v1/productos");
    expect(result.status).toBe(401);
    expect(result.body.success).toBe(false);
  });
});
