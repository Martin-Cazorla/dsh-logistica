// Carga (idempotente) las zonas comerciales iniciales y asigna zona a las
// direcciones existentes. Uso: npm run seed:zones
import { PrismaClient } from '@prisma/client';
import { seedSalesZones } from '../src/sales-zones/sales-zones.seed';

const prisma = new PrismaClient();

seedSalesZones(prisma)
  .then((r) =>
    console.log(
      `✅ Zonas comerciales: ${r.zones} zonas, ${r.localitiesCreated} localidades nuevas.`,
    ),
  )
  .catch((e) => {
    console.error('❌ Error cargando zonas:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
