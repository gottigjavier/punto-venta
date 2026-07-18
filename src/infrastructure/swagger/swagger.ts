// src/infrastructure/swagger/swagger.ts
// Swagger/OpenAPI documentation configuration
import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { env } from '../config/env.js';

export async function registerSwagger(fastify: FastifyInstance): Promise<void> {
  // Register Swagger generator
  await fastify.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'Punto de Venta API',
        description:
          'API REST para sistema de punto de venta.\n\n' +
          '## Autenticación\n' +
          'Todos los endpoints protegidos requieren un Bearer Token en el header `Authorization`.\n\n' +
          '### Obtener token\n' +
          '```POST /api/v1/auth/login``` con `{ "nik_usuario": "...", "password": "..." }`\n\n' +
          '### Usar token\n' +
          '```Authorization: Bearer <token>```\n\n' +
          '## Roles\n' +
          '| Rol | Permisos |\n' +
          '|-----|----------|\n' +
          '| admin | CRUD completo en todos los módulos |\n' +
          '| gerente | CRUD en productos, proveedores, rubros, stock, ventas |\n' +
          '| despachador | Lectura de productos, creación de ventas, lectura de stock |',
        version: '2.0.0',
        contact: {
          name: 'Equipo de Desarrollo',
        },
        license: {
          name: 'ISC',
        },
      },
      servers: [
        {
          url: `http://localhost:${env.API_PORT}`,
          description: 'Servidor de desarrollo',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Token JWT de acceso. Obtenerlo con POST /api/v1/auth/login',
          },
        },
        schemas: {
          // ===== Generic response schemas =====
          SuccessResponse: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: { description: 'Datos de respuesta' },
            },
          },
          ErrorResponse: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: false },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string', example: 'NOT_FOUND' },
                  message: { type: 'string', example: 'Recurso no encontrado' },
                  details: { description: 'Detalles adicionales del error' },
                },
              },
            },
          },
          Pagination: {
            type: 'object',
            properties: {
              page: { type: 'integer', example: 1 },
              limit: { type: 'integer', example: 20 },
              total: { type: 'integer', example: 150 },
              totalPages: { type: 'integer', example: 8 },
            },
          },

          // ===== Auth schemas =====
          LoginRequest: {
            type: 'object',
            required: ['nik_usuario', 'password'],
            properties: {
              nik_usuario: {
                type: 'string',
                example: 'admin',
                description: 'Nick de usuario (max 50 caracteres)',
              },
              password: {
                type: 'string',
                example: 'Admin123!',
                description: 'Contraseña del usuario',
              },
            },
          },
          LoginResponse: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  accessToken: { type: 'string', description: 'JWT access token (15min exp)' },
                  user: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', format: 'uuid' },
                      nombre_usuario: { type: 'string', example: 'Administrador' },
                      nik_usuario: { type: 'string', example: 'admin' },
                      email: { type: 'string', format: 'email' },
                      rol: { type: 'string', enum: ['admin', 'gerente', 'despachador'] },
                    },
                  },
                },
              },
            },
          },
          RefreshResponse: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  accessToken: { type: 'string', description: 'Nuevo JWT access token' },
                },
              },
            },
          },

          // ===== Usuario schemas =====
          Usuario: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              nombre_usuario: { type: 'string', example: 'Juan Pérez' },
              nik_usuario: { type: 'string', example: 'jperez' },
              email: { type: 'string', format: 'email' },
              telefono: { type: 'string', nullable: true },
              rol: { type: 'string', enum: ['admin', 'gerente', 'despachador'] },
              activo: { type: 'boolean' },
              intentos_fallidos: { type: 'integer' },
              bloqueado_hasta: { type: 'string', format: 'date-time', nullable: true },
              created_at: { type: 'string', format: 'date-time' },
              updated_at: { type: 'string', format: 'date-time', nullable: true },
            },
          },
          CreateUsuarioRequest: {
            type: 'object',
            required: ['nombre_usuario', 'nik_usuario', 'password', 'email', 'rol'],
            properties: {
              nombre_usuario: { type: 'string', example: 'Juan Pérez' },
              nik_usuario: { type: 'string', example: 'jperez' },
              password: {
                type: 'string',
                example: 'Admin123!',
                description: 'Mínimo 8 caracteres, 1 mayúscula, 1 número, 1 carácter especial',
              },
              email: { type: 'string', format: 'email' },
              telefono: { type: 'string' },
              rol: { type: 'string', enum: ['admin', 'gerente', 'despachador'] },
              activo: { type: 'boolean', default: true },
            },
          },

          // ===== Producto schemas =====
          Producto: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              nombre: { type: 'string', example: 'Pan integral' },
              codigo: { type: 'string', example: 'PAN-001' },
              cantidad_disponible: { type: 'number', example: 45 },
              precio_compra: { type: 'number', example: 180.0 },
              precio_venta: { type: 'number', example: 250.0 },
              rubro_id: { type: 'string', format: 'uuid' },
              proveedor_id: { type: 'string', format: 'uuid' },
              fecha_compra: { type: 'string', format: 'date', nullable: true },
              fecha_vencimiento: { type: 'string', format: 'date', nullable: true },
              numero_remesa: { type: 'string', nullable: true },
              unidad_medida: { type: 'string', enum: ['unidad', 'kg', 'g', 'l', 'ml'] },
              created_at: { type: 'string', format: 'date-time' },
              updated_at: { type: 'string', format: 'date-time', nullable: true },
            },
          },
          CreateProductoRequest: {
            type: 'object',
            required: ['nombre', 'codigo', 'cantidad_disponible', 'precio_compra', 'precio_venta', 'rubro_id', 'proveedor_id'],
            properties: {
              nombre: { type: 'string', example: 'Pan integral' },
              codigo: { type: 'string', example: 'PAN-001' },
              cantidad_disponible: { type: 'number', example: 45, minimum: 0 },
              precio_compra: { type: 'number', example: 180.0, minimum: 0 },
              precio_venta: { type: 'number', example: 250.0, minimum: 0 },
              rubro_id: { type: 'string', format: 'uuid' },
              proveedor_id: { type: 'string', format: 'uuid' },
              fecha_compra: { type: 'string', format: 'date' },
              fecha_vencimiento: { type: 'string', format: 'date' },
              numero_remesa: { type: 'string' },
              unidad_medida: { type: 'string', enum: ['unidad', 'kg', 'g', 'l', 'ml'], default: 'unidad' },
            },
          },

          // ===== Proveedor schemas =====
          Proveedor: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              razon_social: { type: 'string', example: 'Distribuidora Central S.A.' },
              representante: { type: 'string', nullable: true },
              cuit: { type: 'string', example: '20-12345678-9', nullable: true },
              direccion_postal: { type: 'string', nullable: true },
              email: { type: 'string', format: 'email', nullable: true },
              telefonos: { type: 'array', items: { type: 'string' }, nullable: true },
              created_at: { type: 'string', format: 'date-time' },
              updated_at: { type: 'string', format: 'date-time', nullable: true },
            },
          },
          CreateProveedorRequest: {
            type: 'object',
            required: ['razon_social'],
            properties: {
              razon_social: { type: 'string', example: 'Distribuidora Central S.A.' },
              representante: { type: 'string' },
              cuit: { type: 'string', description: 'Formato: XX-XXXXXXXX-X' },
              direccion_postal: { type: 'string' },
              email: { type: 'string', format: 'email' },
              telefonos: { type: 'array', items: { type: 'string' } },
            },
          },

          // ===== Rubro schemas =====
          Rubro: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              nombre: { type: 'string', example: 'Panadería' },
              descripcion: { type: 'string', nullable: true },
              activo: { type: 'boolean' },
            },
          },
          CreateRubroRequest: {
            type: 'object',
            required: ['nombre'],
            properties: {
              nombre: { type: 'string', example: 'Panadería' },
              descripcion: { type: 'string' },
              activo: { type: 'boolean', default: true },
            },
          },

          // ===== Venta schemas =====
          Venta: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              usuario_id: { type: 'string', format: 'uuid' },
              total: { type: 'number', example: 750.0 },
              estado: { type: 'string', enum: ['pendiente', 'completada', 'cancelada'] },
              created_at: { type: 'string', format: 'date-time' },
              usuario: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  nombre_usuario: { type: 'string' },
                  nik_usuario: { type: 'string' },
                },
              },
              detalles_venta: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    venta_id: { type: 'string', format: 'uuid' },
                    producto_id: { type: 'string', format: 'uuid' },
                    cantidad: { type: 'number' },
                    precio_unitario: { type: 'number' },
                    subtotal: { type: 'number' },
                    producto: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', format: 'uuid' },
                        nombre: { type: 'string' },
                        codigo: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          DetalleVentaInput: {
            type: 'object',
            required: ['producto_id', 'cantidad', 'precio_unitario'],
            properties: {
              producto_id: { type: 'string', format: 'uuid' },
              cantidad: { type: 'number', minimum: 0.001, example: 3 },
              precio_unitario: { type: 'number', minimum: 0, example: 250.0 },
            },
          },
          CreateVentaRequest: {
            type: 'object',
            required: ['productos'],
            properties: {
              productos: {
                type: 'array',
                minItems: 1,
                items: { $ref: '#/components/schemas/DetalleVentaInput' },
              },
            },
          },
          ResumenDia: {
            type: 'object',
            properties: {
              fecha: { type: 'string', example: '2024-01-15' },
              total_ventas: { type: 'integer', example: 12 },
              monto_total: { type: 'number', example: 15600.0 },
              productos_vendidos: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    producto_id: { type: 'string', format: 'uuid' },
                    nombre: { type: 'string' },
                    cantidad_total: { type: 'number' },
                    monto_total: { type: 'number' },
                  },
                },
              },
              ventas_por_usuario: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    usuario_id: { type: 'string', format: 'uuid' },
                    nombre: { type: 'string' },
                    cantidad_ventas: { type: 'integer' },
                    monto_total: { type: 'number' },
                  },
                },
              },
            },
          },
          ProductoMasVendido: {
            type: 'object',
            properties: {
              producto_id: { type: 'string', format: 'uuid', description: 'ID del producto' },
              cantidad_total: { type: 'number', example: 500, description: 'Total de unidades vendidas (solo ventas completadas)' },
              monto_total: { type: 'number', example: 12500.0, description: 'Monto total vendido del producto' },
            },
          },

          // ===== Stock schemas =====
          StockItem: {
            allOf: [
              { $ref: '#/components/schemas/Producto' },
              {
                type: 'object',
                properties: {
                  rubro: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', format: 'uuid' },
                      nombre: { type: 'string' },
                    },
                  },
                  proveedor: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', format: 'uuid' },
                      razon_social: { type: 'string' },
                    },
                  },
                  estado_vencimiento: { type: 'string', enum: ['vencido', 'por_vencer', 'ok'] },
                  stock_bajo: { type: 'boolean' },
                },
              },
            ],
          },
          StockIngresoRequest: {
            type: 'object',
            required: ['nombre', 'codigo', 'cantidad', 'precio_compra', 'precio_venta', 'rubro_id', 'proveedor_id'],
            properties: {
              nombre: { type: 'string', example: 'Pan integral' },
              codigo: { type: 'string', example: 'PAN-001' },
              cantidad: { type: 'number', minimum: 0.001, example: 45 },
              precio_compra: { type: 'number', minimum: 0, example: 180.0 },
              precio_venta: { type: 'number', minimum: 0, example: 250.0 },
              rubro_id: { type: 'string', format: 'uuid' },
              proveedor_id: { type: 'string', format: 'uuid' },
              fecha_compra: { type: 'string', format: 'date' },
              fecha_vencimiento: { type: 'string', format: 'date' },
              numero_remesa: { type: 'string' },
              unidad_medida: { type: 'string', enum: ['unidad', 'kg', 'g', 'l', 'ml'], default: 'unidad' },
            },
          },
          StockEditRequest: {
            type: 'object',
            properties: {
              nombre: { type: 'string' },
              codigo: { type: 'string' },
              cantidad: { type: 'number', minimum: 0 },
              precio_compra: { type: 'number', minimum: 0 },
              precio_venta: { type: 'number', minimum: 0 },
              rubro_id: { type: 'string', format: 'uuid' },
              proveedor_id: { type: 'string', format: 'uuid' },
              fecha_compra: { type: 'string', format: 'date' },
              fecha_vencimiento: { type: 'string', format: 'date' },
              numero_remesa: { type: 'string' },
              unidad_medida: { type: 'string', enum: ['unidad', 'kg', 'g', 'l', 'ml'] },
            },
          },
        },
      },
      tags: [
        { name: 'Health', description: 'Health checks del servidor' },
        { name: 'Auth', description: 'Autenticación y autorización' },
        { name: 'Usuarios', description: 'Gestión de usuarios (solo admin)' },
        { name: 'Productos', description: 'CRUD de productos' },
        { name: 'Proveedores', description: 'Gestión de proveedores' },
        { name: 'Rubros', description: 'Gestión de rubros/categorías' },
        { name: 'Ventas', description: 'Módulo de ventas y despacho' },
        { name: 'Stock', description: 'Gestión de inventario y stock' },
      ],
    },
  });

  // Register Swagger UI
  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      filter: true,
      showExtensions: true,
      showCommonExtensions: true,
      tryItOutEnabled: true,
    },
    uiHooks: {
      onRequest: (_request, _reply, next) => {
        next();
      },
    },
    staticCSP: true,
  });
}
