// prisma/seed.ts

import { PrismaClient, UserRole, LocationType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando la precarga de datos iniciales (Seeding)...');

  // ==========================================
  // 1. USUARIOS INICIALES (ADMIN Y PICKER)
  // ==========================================
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@dshlogistica.com' },
    update: {},
    create: {
      email: 'admin@dshlogistica.com',
      password: 'password123', // En producción usaremos bcrypt
      firstName: 'Administrador',
      lastName: 'General',
      role: UserRole.ADMIN,
      isActive: true,
    },
  });

  const pickerUser = await prisma.user.upsert({
    where: { email: 'picker1@dshlogistica.com' },
    update: {},
    create: {
      email: 'picker1@dshlogistica.com',
      password: 'password123',
      firstName: 'Operario',
      lastName: 'Picking 1',
      role: UserRole.PICKER,
      isActive: true,
    },
  });

  console.log('✅ Usuarios creados.');

  // ==========================================
  // 2. DEPÓSITOS OPERATIVOS
  // ==========================================
  const warehousesData = [
    { code: 'CHILE-1', name: 'Chile 1' },
    { code: 'CHILE-2', name: 'Chile 2' },
    { code: 'MURGUINDO', name: 'Murguindo' },
    { code: 'ARMENIA', name: 'Armenia' },
    { code: 'MOLINEDO', name: 'Molinedo' },
  ];

  const warehousesMap = new Map<string, string>();

  for (const wh of warehousesData) {
    const createdWh = await prisma.warehouse.upsert({
      where: { code: wh.code },
      update: {},
      create: {
        code: wh.code,
        name: wh.name,
        isActive: true,
      },
    });
    warehousesMap.set(wh.code, createdWh.id);
  }

  console.log(
    '✅ 5 Depósitos creados (Chile 1, Chile 2, Murguindo, Armenia, Molinedo).',
  );

  // ==========================================
  // 3. PASILLOS Y NIVELES (UBICACIONES)
  // ==========================================
  const aisles = [
    'pas. D',
    'pas. E',
    'pas. F',
    'pas. G',
    'pas. H',
    'pas. I',
    'pas. J',
    'pas. K',
    'tech. dev',
    'tech ofi',
  ];

  const racks = ['A', 'B', 'C']; // A: Piso, B: Nivel 2, C: Nivel 3
  const positions = ['01', '02', '03', '04', '05'];

  let totalLocationsCreated = 0;

  for (const [whCode, whId] of warehousesMap.entries()) {
    for (const aisle of aisles) {
      for (const rack of racks) {
        for (const pos of positions) {
          // Normalización limpia para el código de ubicación
          const aisleClean = aisle
            .replace(/\s+/g, '-')
            .replace(/\./g, '')
            .toUpperCase();
          const code = `${aisleClean}-RACK-${rack}-POS-${pos}`;

          // Observación ejemplo para Chile 2 en pasillo F
          let notes: string | null = null;
          if (whCode === 'CHILE-2' && aisle === 'pas. F') {
            notes = 'Enfrente del baño';
          }

          await prisma.location.upsert({
            where: {
              warehouseId_code: {
                warehouseId: whId,
                code: code,
              },
            },
            update: {},
            create: {
              warehouseId: whId,
              code: code,
              aisle: aisle,
              rack: rack,
              position: pos,
              type: LocationType.STORAGE,
              notes: notes,
            },
          });
          totalLocationsCreated++;
        }
      }
    }
  }

  console.log(
    `✅ ${totalLocationsCreated} Ubicaciones físicas generadas con éxito.`,
  );
  console.log('🚀 Seeding completado exitosamente.');
}

main()
  .catch((e) => {
    console.error('❌ Error en el Seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
