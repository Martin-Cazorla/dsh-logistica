// Asigna la zona comercial a TODAS las direcciones existentes y lista las
// combinaciones provincia/localidad que quedaron sin zona.
// Uso: npm run backfill:zones
import { PrismaClient } from '@prisma/client';
import {
  assignAddressZones,
  listUnassignedLocalities,
} from '../src/sales-zones/sales-zones.seed';

const prisma = new PrismaClient();

async function main() {
  const updated = await assignAddressZones(prisma);
  const total = await prisma.customerAddress.count();
  const withZone = await prisma.customerAddress.count({
    where: { zoneId: { not: null } },
  });
  console.log(
    `✅ Backfill: ${updated} direcciones procesadas, ${withZone}/${total} con zona.`,
  );

  const pending = await listUnassignedLocalities(prisma);
  if (pending.length === 0) {
    console.log('Todas las direcciones activas tienen zona asignada.');
    return;
  }
  console.log(`\n⚠️  ${pending.length} combinaciones provincia/localidad sin zona:`);
  console.table(
    pending.map((p) => ({
      provincia: p.provinceLabel,
      localidad: p.localityLabel,
      clave: `${p.province} / ${p.locality}`,
      direcciones: p.addresses,
      clientes: p.customers,
    })),
  );
}

main()
  .catch((e) => {
    console.error('❌ Error en el backfill:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
