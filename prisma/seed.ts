// prisma/seed.ts
// Seed script - Usuario admin por defecto
import 'dotenv/config';
import { PrismaClient, Rol } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL']! });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  console.log('🌱 Iniciando seed...');

  // Usuario admin por defecto
  const adminPassword = await bcrypt.hash('password', 12);

  const admin = await prisma.usuario.upsert({
    where: { nik_usuario: 'user' },
    update: {},
    create: {
      nombre_usuario: 'Administrador',
      nik_usuario: 'user',
      password_hash: adminPassword,
      email: 'admin@puntoventa.local',
      telefono: '+5491100000000',
      rol: Rol.admin,
      activo: true,
    },
  });

  console.log('✅ Usuario admin creado:', {
    id: admin.id,
    nik_usuario: admin.nik_usuario,
    email: admin.email,
    rol: admin.rol,
  });

  // Rubros de ejemplo
  const rubros = [
    { nombre: 'Panadería', descripcion: 'Productos de panadería' },
    { nombre: 'Lácteos', descripcion: 'Productos lácteos' },
    { nombre: 'Bebidas', descripcion: 'Bebidas en general' },
    { nombre: 'Snacks', descripcion: 'Snacks y golosinas' },
    { nombre: 'Limpieza', descripcion: 'Productos de limpieza' },
  ];

  for (const rubro of rubros) {
    await prisma.rubro.upsert({
      where: { nombre: rubro.nombre },
      update: {},
      create: rubro,
    });
  }

  console.log('✅ Rubros creados:', rubros.length);

  // Proveedor de ejemplo
  const proveedor = await prisma.proveedor.upsert({
    where: { cuit: '30-71234567-9' },
    update: {},
    create: {
      razon_social: 'Distribuidora Ejemplo S.A.',
      representante: 'Juan Pérez',
      cuit: '30-71234567-9',
      direccion_postal: 'Av. Corrientes 1234, CABA',
      email: 'contacto@ejemplo.com.ar',
      telefonos: ['+5491122223333', '+5491144445555'],
    },
  });

  console.log('✅ Proveedor creado:', proveedor.razon_social);

  console.log('🎉 Seed completado exitosamente');
}

main()
  .catch((e: Error) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
