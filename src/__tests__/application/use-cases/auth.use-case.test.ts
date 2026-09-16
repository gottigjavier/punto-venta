// src/__tests__/application/use-cases/auth.use-case.test.ts
// Auth use case tests — enfoque en el flujo de Bootstrap (SE1): primer admin.
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  bootstrapStatusUseCase,
  bootstrapUseCase,
} from "../../../application/use-cases/auth.use-case.js";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    usuario: {
      count: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../../infrastructure/database/prisma/client.js", () => ({
  prisma: mockPrisma,
}));

vi.mock("../../../infrastructure/logging/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../../infrastructure/auth/password.js", () => ({
  verifyPassword: vi.fn(),
  hashPassword: vi.fn().mockResolvedValue("hashed-password"),
}));

vi.mock("../../../infrastructure/auth/jwt.js", () => ({
  generateTokenPair: vi.fn().mockReturnValue({
    accessToken: "access-token-mock",
    refreshToken: "refresh-token-mock",
  }),
  generateAccessToken: vi.fn(),
  generateRefreshToken: vi.fn(),
  verifyRefreshToken: vi.fn(),
}));

function mockUsuarioCreado(overrides?: Record<string, unknown>) {
  return {
    id: "123e4567-e89b-12d3-a456-426614174002",
    nombre_usuario: "Admin Inicial",
    nik_usuario: "admin",
    password_hash: "hashed-password",
    email: "admin@negocio.com",
    telefono: null,
    rol: "admin",
    activo: true,
    intentos_fallidos: 0,
    bloqueado_hasta: null,
    refresh_token_version: 0,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function validBootstrapInput() {
  return {
    nombre_usuario: "Admin Inicial",
    nik_usuario: "admin",
    email: "admin@negocio.com",
    telefono: undefined,
    password: "MangoSeguro2024!",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // $transaction ejecuta el callback pasando mockPrisma como "tx". Así,
  // tx.usuario.count / tx.usuario.create resuelven contra el mismo mock.
  mockPrisma.$transaction.mockImplementation(
    async (cb: (tx: unknown) => unknown) => cb(mockPrisma),
  );
});

describe("bootstrapStatusUseCase", () => {
  it("devuelve needsBootstrap=true cuando no existe ningún usuario", async () => {
    mockPrisma.usuario.count.mockResolvedValue(0);
    const result = await bootstrapStatusUseCase();
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ needsBootstrap: true });
  });

  it("devuelve needsBootstrap=false cuando ya hay usuarios", async () => {
    mockPrisma.usuario.count.mockResolvedValue(3);
    const result = await bootstrapStatusUseCase();
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ needsBootstrap: false });
  });

  it("devuelve DATABASE_ERROR si el conteo falla", async () => {
    mockPrisma.usuario.count.mockRejectedValue(new Error("db down"));
    const result = await bootstrapStatusUseCase();
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("DATABASE_ERROR");
  });
});

describe("bootstrapUseCase", () => {
  it("crea el primer admin con rol forzado a admin y devuelve tokens", async () => {
    mockPrisma.usuario.count.mockResolvedValue(0);
    mockPrisma.usuario.create.mockResolvedValue(mockUsuarioCreado());

    const result = await bootstrapUseCase(validBootstrapInput());

    expect(result.isOk()).toBe(true);
    const value = result._unsafeUnwrap();

    // El rol siempre es admin, y el server lo fuerza (el input no trae rol).
    expect(mockPrisma.usuario.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ rol: "admin", activo: true }),
      }),
    );
    // No se filtra ni devuelve el hash en la respuesta.
    expect(value.user).not.toHaveProperty("password_hash");
    expect(value.user.rol).toBe("admin");
    // Emite los mismos tokens que /login para iniciar sesión directo.
    expect(value.tokens.accessToken).toBe("access-token-mock");
    expect(value.tokens.refreshToken).toBe("refresh-token-mock");
  });

  it("devuelve CONFLICT cuando ya existe al menos un usuario", async () => {
    mockPrisma.usuario.count.mockResolvedValue(1);
    const result = await bootstrapUseCase(validBootstrapInput());
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe("CONFLICT");
    // No debe intentar crear nada.
    expect(mockPrisma.usuario.create).not.toHaveBeenCalled();
  });

  it("descarta el telefono vacío y lo persiste como null", async () => {
    mockPrisma.usuario.count.mockResolvedValue(0);
    mockPrisma.usuario.create.mockResolvedValue(mockUsuarioCreado());
    await bootstrapUseCase({ ...validBootstrapInput(), telefono: undefined });
    expect(mockPrisma.usuario.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ telefono: null }),
      }),
    );
  });
});
