import { PrismaClient, UserRole, LocationType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando la precarga de datos iniciales (Seeding)...');

  // ==========================================
  // 1. USUARIOS INICIALES CON BCRYPT (ADMIN, PICKER, DRIVER)
  // ==========================================
  const hashedPassword = await bcrypt.hash('123456', 10);

  await prisma.user.upsert({
    where: { email: 'admin@dshlogistica.com' },
    update: {},
    create: {
      email: 'admin@dshlogistica.com',
      password: hashedPassword,
      firstName: 'Héctor',
      lastName: 'Cazorla',
      role: UserRole.ADMIN,
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: 'picker1@dshlogistica.com' },
    update: {},
    create: {
      email: 'picker1@dshlogistica.com',
      password: hashedPassword,
      firstName: 'Operario',
      lastName: 'Picking 1',
      role: UserRole.PICKER,
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: 'driver1@dshlogistica.com' },
    update: {},
    create: {
      email: 'driver1@dshlogistica.com',
      password: hashedPassword,
      firstName: 'Chofer',
      lastName: 'Reparto 1',
      role: UserRole.DRIVER,
      isActive: true,
    },
  });

  console.log(
    '✅ 3 Usuarios creados con seguridad bcrypt (Admin, Picker, Driver).',
  );

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

  const racks = ['A', 'B', 'C'];
  const positions = ['01', '02', '03', '04', '05'];

  let totalLocationsCreated = 0;
  let firstLocationId = '';

  for (const [whCode, whId] of warehousesMap.entries()) {
    for (const aisle of aisles) {
      for (const rack of racks) {
        for (const pos of positions) {
          const aisleClean = aisle
            .replace(/\s+/g, '-')
            .replace(/\./g, '')
            .toUpperCase();
          const code = `${aisleClean}-RACK-${rack}-POS-${pos}`;

          let notes: string | null = null;
          if (whCode === 'CHILE-2' && aisle === 'pas. F') {
            notes = 'Enfrente del baño';
          }

          const createdLoc = await prisma.location.upsert({
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

          if (!firstLocationId && whCode === 'CHILE-1') {
            firstLocationId = createdLoc.id;
          }

          totalLocationsCreated++;
        }
      }
    }
  }

  console.log(
    `✅ ${totalLocationsCreated} Ubicaciones físicas generadas con éxito.`,
  );

  // ==========================================
  // 4. PRODUCTO REAL Y CARGA DE INVENTARIO (US582)
  // ==========================================
  const mainWarehouseId = warehousesMap.get('CHILE-1');

  if (mainWarehouseId && firstLocationId) {
    const product = await prisma.product.upsert({
      where: { sku: 'US582' },
      update: {},
      create: {
        sku: 'US582',
        name: 'Bebedero mascotas',
        unitsPerBox: 50, // QTY 50 unidades por bulto cerrado
        unitPrice: 3500.0,
        weightKg: 10.0, // G.W 10kg por bulto cerrado
        volumeM3: 0.0889, // Medidas 47x43x44cm (~0.0889 m³)
      },
    });

    await prisma.inventory.upsert({
      where: {
        locationId_productId_lotNumber: {
          locationId: firstLocationId,
          productId: product.id,
          lotNumber: 'LOTE-2026-01',
        },
      },
      update: { quantity: 200 },
      create: {
        warehouseId: mainWarehouseId,
        locationId: firstLocationId,
        productId: product.id,
        lotNumber: 'LOTE-2026-01',
        quantity: 200, // 200 bultos cerrados en stock inicial
      },
    });

    console.log('✅ Producto US582 e Inventario inicial cargados en Chile 1.');
  }

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
