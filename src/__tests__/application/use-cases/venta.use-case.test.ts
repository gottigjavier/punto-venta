// src/__tests__/application/use-cases/venta.use-case.test.ts
// Tests para createVenta (FEFO) y deleteVenta (revert por lote), modelo Lote.
// Patrón del repo: mock inline via vi.hoisted + vi.mock del client + logger.
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createVenta,
  getVentaById,
  listVentas,
  getResumenDia,
  deleteVenta,
  cerrarCaja,
  getMasVendidosPorProducto,
} from "../../../application/use-cases/venta.use-case.js";
import type { VentaQueryInput } from "../../../application/dto/venta.dto.js";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    producto: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    lote: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    venta: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    detalleVenta: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    cierreCaja: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    movimientoCaja: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    usuario: { findUnique: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

vi.mock("../../../infrastructure/database/prisma/client.js", () => ({
  prisma: mockPrisma,
}));

vi.mock("../../../infrastructure/logging/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../../infrastructure/auth/password.js", () => ({
  verifyPassword: vi.fn(),
}));

// ---- Mock factories ----
const PRODUCTO_ID = "123e4567-e89b-12d3-a456-426614174000";

function mockLoteDb(overrides: Record<string, unknown> = {}) {
  return {
    id: "lote-1",
    producto_id: PRODUCTO_ID,
    numero_lote: "L-001",
    cantidad_disponible: 45,
    fecha_compra: new Date("2024-01-15"),
    fecha_vencimiento: new Date("2024-12-31"),
    precio_compra: 150,
    estado: "activo",
    created_at: new Date(),
    ...overrides,
  };
}

// "Hoy" congelado para los tests que dependen de vencimientos: 2026-08-29
// 10:00 UTC-3. (El equivalente FEFO contra Postgres vive ahora en
// src/application/use-cases/venta-fefo.test.ts.)
const MOCK_NOW = Date.UTC(2026, 7, 29, 13, 0, 0);

function mockVentaDb(overrides: Record<string, unknown> = {}) {
  return {
    id: "venta-1",
    usuario_id: "user-1",
    total: 500,
    estado: "completada",
    cierre_caja_id: null,
    created_at: new Date(),
    usuario: { id: "user-1", nombre_usuario: "Juan" },
    detalles_venta: [
      {
        id: "det-1",
        venta_id: "venta-1",
        producto_id: PRODUCTO_ID,
        lote_id: "L2",
        cantidad: 7,
        precio_unitario: 50,
        subtotal: 350,
        producto: {
          id: PRODUCTO_ID,
          nombre: "Pan integral",
          codigo: "PAN-001",
        },
      },
      {
        id: "det-2",
        venta_id: "venta-1",
        producto_id: PRODUCTO_ID,
        lote_id: "L3",
        cantidad: 3,
        precio_unitario: 50,
        subtotal: 150,
        producto: {
          id: PRODUCTO_ID,
          nombre: "Pan integral",
          codigo: "PAN-001",
        },
      },
    ],
    ...overrides,
  };
}

describe("Venta Use Cases (modelo Lote)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Usa fake timers SOLO para tests que dependen de "hoy" (vencimientos).
  // Se define a nivel describe padre para que deleteVenta también lo use.
  const withFakeNow = (fn: () => void | Promise<void>) => async () => {
    vi.useFakeTimers({ now: MOCK_NOW, toFake: ["Date"] });
    try {
      await fn();
    } finally {
      vi.useRealTimers();
    }
  };

  // ----------------------------------------------------------------------
  describe("createVenta (FEFO sobre lotes)", () => {

    it("producto no encontrado → NOT_FOUND", async () => {
      mockPrisma.producto.findMany.mockResolvedValue([]);
      const result = await createVenta(
        {
          productos: [{ producto_id: "no-existe", cantidad: 1 }],
        },
        "user-1",
      );
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe("NOT_FOUND");
    });

    it("transaction fails → DATABASE_ERROR", async () => {
      mockPrisma.producto.findMany.mockResolvedValue([
        { id: PRODUCTO_ID, precio_venta: 50 },
      ]);
      mockPrisma.$transaction.mockRejectedValue(
        new Error("Transaction failed"),
      );
      const result = await createVenta(
        {
          productos: [{ producto_id: PRODUCTO_ID, cantidad: 1 }],
        },
        "user-1",
      );
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe("DATABASE_ERROR");
    });
  });

  // ----------------------------------------------------------------------
  describe("deleteVenta", () => {
    it("CONFLICT si pertenece a período cerrado (cierre_caja_id != null)", async () => {
      mockPrisma.venta.findUnique.mockResolvedValue(
        mockVentaDb({ cierre_caja_id: "cierre-1" }),
      );

      const result = await deleteVenta("venta-1");

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe("CONFLICT");
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it("VALIDATION_ERROR si algún detalle tiene lote_id NULL (pre-migración)", async () => {
      mockPrisma.venta.findUnique.mockResolvedValue(
        mockVentaDb({
          detalles_venta: [
            {
              id: "d1",
              venta_id: "venta-1",
              producto_id: PRODUCTO_ID,
              lote_id: null,
              cantidad: 3,
              precio_unitario: 50,
              subtotal: 150,
              producto: {
                id: PRODUCTO_ID,
                nombre: "Pan integral",
                codigo: "PAN-001",
              },
            },
          ],
        }),
      );

      const result = await deleteVenta("venta-1");
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe("VALIDATION_ERROR");
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it("CONFLICT si la venta no está completada", async () => {
      mockPrisma.venta.findUnique.mockResolvedValue(
        mockVentaDb({ estado: "cancelada" }),
      );

      const result = await deleteVenta("venta-1");
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe("CONFLICT");
    });

    it(
      "revierte stock por lote: agotado→activo; vencido si venc<hoy",
      withFakeNow(async () => {
        const loteVigente = mockLoteDb({
          id: "LV",
          cantidad_disponible: 0,
          estado: "agotado",
          fecha_vencimiento: new Date("2026-12-01T00:00:00.000Z"),
        });
        const loteVencido = mockLoteDb({
          id: "LVD",
          cantidad_disponible: 0,
          estado: "agotado",
          fecha_vencimiento: new Date("2020-01-01T00:00:00.000Z"),
        });

        mockPrisma.venta.findUnique.mockResolvedValue(
          mockVentaDb({
            detalles_venta: [
              {
                id: "d1",
                venta_id: "venta-1",
                producto_id: PRODUCTO_ID,
                lote_id: "LV",
                cantidad: 3,
                precio_unitario: 50,
                subtotal: 150,
                producto: {
                  id: PRODUCTO_ID,
                  nombre: "Pan integral",
                  codigo: "PAN-001",
                },
              },
              {
                id: "d2",
                venta_id: "venta-1",
                producto_id: PRODUCTO_ID,
                lote_id: "LVD",
                cantidad: 5,
                precio_unitario: 50,
                subtotal: 250,
                producto: {
                  id: PRODUCTO_ID,
                  nombre: "Pan integral",
                  codigo: "PAN-001",
                },
              },
            ],
          }),
        );

        const loteUpdate = vi.fn().mockResolvedValue({});
        // El use-case: (1) bucle de incremento (qty += cantidad), luego (2) lee findUnique
        // para decidir reactivar. El findUnique debe devolver qty YA incrementado (post-revert).
        // LV: +3 → qty 3 >0, venc 2026 > hoy → reactiva a 'activo'.
        // LVD: +5 → qty 5 >0, venc 2020 < hoy → reactiva a 'vencido'.
        const loteFindUnique = vi
          .fn()
          .mockResolvedValueOnce({ ...loteVigente, cantidad_disponible: 3 })
          .mockResolvedValueOnce({ ...loteVencido, cantidad_disponible: 5 });
        const txQueryRaw = vi
          .fn()
          .mockResolvedValueOnce([
            {
              id: "venta-1",
              cierre_caja_id: null,
              estado: "completada",
            },
          ])
          .mockResolvedValueOnce([{ id: "LV" }, { id: "LVD" }]);
        mockPrisma.$transaction.mockImplementation(
          async (fn: (tx: unknown) => Promise<unknown>) =>
            fn({
              // Foto FOR UPDATE: deleteVenta re-valida cierre_caja_id/estado
              // dentro de la tx (anti-TOCTOU con cerrarCaja). Venta abierta → pasa.
              $executeRaw: vi.fn().mockResolvedValue(1),
              $queryRaw: txQueryRaw,
              lote: { findUnique: loteFindUnique, update: loteUpdate },
              detalleVenta: { deleteMany: vi.fn().mockResolvedValue({}) },
              venta: { delete: vi.fn().mockResolvedValue({}) },
            }),
        );

        const result = await deleteVenta("venta-1");
        expect(result.isOk()).toBe(true);

        // LV: incrementó a 3 y reactivó a 'activo' (venc 2026-12-01 > hoy → activo)
        expect(loteUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: "LV" },
            data: expect.objectContaining({ estado: "activo" }),
          }),
        );
        // LVD: incrementó a 5 y reactivó a 'vencido' (venc 2020 < hoy → vencido)
        expect(loteUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: "LVD" },
            data: expect.objectContaining({ estado: "vencido" }),
          }),
        );
      }),
    );

    it("NOT_FOUND si la venta no existe", async () => {
      mockPrisma.venta.findUnique.mockResolvedValue(null);
      const result = await deleteVenta("non-existent");
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe("NOT_FOUND");
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // ----------------------------------------------------------------------
  // Tests que NO dependen del modelo Lote ni de "hoy" — NO usan fake timers
  describe("getVentaById", () => {
    it("retorna venta con detalles", async () => {
      const mockVenta = mockVentaDb();
      mockPrisma.venta.findUnique.mockResolvedValue(mockVenta);

      const result = await getVentaById("venta-1");
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.id).toBe("venta-1");
        expect(result.value.total).toBe(500);
        expect(result.value.detalles_venta).toHaveLength(2);
      }
    });

    it("NOT_FOUND si no existe", async () => {
      mockPrisma.venta.findUnique.mockResolvedValue(null);
      const result = await getVentaById("non-existent");
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe("NOT_FOUND");
    });

    it("DATABASE_ERROR", async () => {
      mockPrisma.venta.findUnique.mockRejectedValue(new Error("DB error"));
      const result = await getVentaById("x");
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe("DATABASE_ERROR");
    });
  });

  describe("listVentas", () => {
    it("paginada con filtros (cierre_caja_id=null default)", async () => {
      mockPrisma.venta.findMany.mockResolvedValue([
        {
          id: "v1",
          usuario_id: "u1",
          total: 500,
          estado: "completada",
          created_at: new Date(),
          usuario: { nombre_usuario: "Juan" },
          _count: { detalles_venta: 2 },
        },
        {
          id: "v2",
          usuario_id: "u2",
          total: 300,
          estado: "completada",
          created_at: new Date(),
          usuario: { nombre_usuario: "María" },
          _count: { detalles_venta: 1 },
        },
      ]);
      mockPrisma.venta.count.mockResolvedValue(2);

      const result = await listVentas({
        page: 1,
        limit: 20,
        sort: "created_at",
        order: "desc",
      } as VentaQueryInput);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.data).toHaveLength(2);
        expect(result.value.pagination.total).toBe(2);
        expect(result.value.data[0]?.cantidad_items).toBe(2);
      }
      expect(mockPrisma.venta.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ cierre_caja_id: null }),
        }),
      );
    });

    it("DATABASE_ERROR", async () => {
      mockPrisma.venta.findMany.mockRejectedValue(new Error("DB error"));
      const result = await listVentas({
        page: 1,
        limit: 20,
        sort: "created_at",
        order: "desc",
      } as VentaQueryInput);
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe("DATABASE_ERROR");
    });
  });

  describe("getResumenDia", () => {
    it("resumen con agregación por producto", async () => {
      // EF2: la agregación corre en SQL ($queryRaw con GROUP BY) — se mockean
      // los cinco agregados: por vendedor, por producto, movimientos por tipo,
      // ventas por método y periodo inicio.
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([
          {
            usuario_id: "u1",
            nombre: "Juan",
            cantidad_ventas: 1,
            monto_total: 500,
          },
        ])
        .mockResolvedValueOnce([
          {
            producto_id: "p1",
            nombre: "Pan integral",
            cantidad_total: 2,
            monto_total: 500,
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            metodo_pago: "EFECTIVO",
            cantidad_ventas: 1,
            monto_total: 500,
          },
        ])
        .mockResolvedValueOnce([
          {
            periodo_inicio: new Date("2026-07-17T10:00:00Z"),
          },
        ]);

      const result = await getResumenDia();
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.total_ventas).toBe(1);
        expect(result.value.monto_total).toBe(500);
        expect(result.value.productos_vendidos[0].cantidad_total).toBe(2);
      }
    });

    it("CO4: no consulta CierreCaja 'abierto' y fecha queda vacía", async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await getResumenDia();
      expect(mockPrisma.cierreCaja.findFirst).not.toHaveBeenCalled();
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.fecha).toBe("");
      }
    });

    it("fecha vacía cuando no hay cierre activo", async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await getResumenDia();
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.fecha).toBe("");
      }
    });

    it("DATABASE_ERROR", async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error("DB error"));
      const result = await getResumenDia();
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe("DATABASE_ERROR");
    });
  });

  describe("cerrarCaja", () => {
    const userId = "user-1";
    const correctPassword = "P@ss123";

    it("cierra con password correcto", async () => {
      const { verifyPassword } = await import(
        "../../../infrastructure/auth/password.js"
      );
      mockPrisma.usuario.findUnique.mockResolvedValue({
        password_hash: "$2a$10$hashed",
      });
      vi.mocked(verifyPassword).mockResolvedValue(true);
      mockPrisma.movimientoCaja.findMany.mockResolvedValue([]);
      mockPrisma.$transaction.mockResolvedValue({
        id: "cierre-1",
        monto_total: 500,
        cantidad_ventas: 1,
        fecha_cierre: new Date(),
      });

      const result = await cerrarCaja(userId, correctPassword);
      expect(result.isOk()).toBe(true);
      expect(verifyPassword).toHaveBeenCalledWith(
        correctPassword,
        "$2a$10$hashed",
      );
    });

    it("UNAUTHORIZED con password incorrecto", async () => {
      const { verifyPassword } = await import(
        "../../../infrastructure/auth/password.js"
      );
      mockPrisma.usuario.findUnique.mockResolvedValue({
        password_hash: "$2a$10$hashed",
      });
      vi.mocked(verifyPassword).mockResolvedValue(false);

      const result = await cerrarCaja(userId, "wrong");
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe("UNAUTHORIZED");
      expect(mockPrisma.venta.findMany).not.toHaveBeenCalled();
    });

    it("CONFLICT si NO hay ventas abiertas (foto FOR UPDATE vacía)", async () => {
      const { verifyPassword } = await import(
        "../../../infrastructure/auth/password.js"
      );
      mockPrisma.usuario.findUnique.mockResolvedValue({
        password_hash: "$2a$10$hashed",
      });
      vi.mocked(verifyPassword).mockResolvedValue(true);
      // La foto estable de ventas abiertas se lee con FOR UPDATE dentro de la
      // tx (flujo blindado). Vacía → NO_OPEN_SALES → CONFLICT.
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.$transaction.mockImplementation(async () => {
        throw new Error("NO_OPEN_SALES");
      });

      const result = await cerrarCaja(userId, correctPassword);
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe("CONFLICT");
    });
  });

  describe("getMasVendidosPorProducto", () => {
    it("agrega y ordena por frecuencia DESC", async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { producto_id: "p1", veces_vendido: 5, monto_total: 12500 },
        { producto_id: "p2", veces_vendido: 2, monto_total: 5000 },
      ]);

      const result = await getMasVendidosPorProducto();
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value[0]?.producto_id).toBe("p1");
        expect(result.value[1]?.producto_id).toBe("p2");
      }
    });

    it("DATABASE_ERROR", async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error("DB error"));
      const result = await getMasVendidosPorProducto();
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().code).toBe("DATABASE_ERROR");
    });
  });
});

void mockVentaDb;
