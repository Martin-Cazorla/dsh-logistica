/**
 * Integración: faltantes de picking, cuarentena, reemplazos, vaciado y
 * Control 1 contra una base Postgres REAL de prueba.
 *
 *   DATABASE_URL=postgresql://.../wms_db_test npm run test:int
 *
 * Por seguridad sólo corre si la base se llama *_test: vacía todas las
 * tablas antes de cada escenario.
 */
import { PickShortReason, PickTaskStatus, Prisma, ShippingType, UserRole } from '@prisma/client';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { OrdersService } from '../src/orders/orders.service';
import { PickingService } from '../src/orders/services/picking.service';
import { OrderCheckingService } from '../src/orders/services/order-checking.service';
import { StockRequestsService } from '../src/inventory/services/stock-requests.service';
import { InventoryGateway } from '../src/inventory/inventory.gateway';
import { AuthenticatedUser } from '../src/auth/interfaces/authenticated-user.interface';

const DB_URL = process.env.DATABASE_URL ?? '';
const isTestDb = /\/[^/?]+_test(\?|$)/.test(DB_URL);
const describeDb = isTestDb ? describe : describe.skip;

jest.setTimeout(60000);

describeDb('Picking: faltantes, cuarentena y reemplazos (integración)', () => {
  const prisma = new PrismaService();
  const audit = new AuditService(prisma);
  const gateway = { emitOccupancyChanged: jest.fn() } as unknown as InventoryGateway;
  const orders = new OrdersService(prisma, audit);
  const picking = new PickingService(prisma, audit, gateway);
  const checking = new OrderCheckingService(prisma, audit);
  const stockRequests = new StockRequestsService(prisma, audit, gateway);

  let admin: AuthenticatedUser;
  let manager: AuthenticatedUser;
  let picker1: AuthenticatedUser;
  let picker2: AuthenticatedUser;
  let checker: AuthenticatedUser;
  let customer: { id: string; addressId: string };
  let productId: string;
  let w1: string;
  let w2: string;
  let seq = 0;

  async function user(role: UserRole, name: string): Promise<AuthenticatedUser> {
    const u = await prisma.user.create({
      data: {
        email: `${name}@test.local`,
        password: 'x',
        firstName: name,
        lastName: 'Test',
        role,
      },
    });
    return {
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      fullName: `${u.firstName} ${u.lastName}`,
      role,
      isActive: true,
    };
  }

  async function location(warehouseId: string, code: string, aisle: string, position: string) {
    return prisma.location.create({
      data: { warehouseId, code, aisle, rack: 'A', position },
    });
  }

  async function stock(warehouseId: string, locationId: string, quantity: number) {
    return prisma.inventory.create({
      data: { warehouseId, locationId, productId, quantity },
    });
  }

  async function createOrder(bultos: number) {
    return orders.create(
      {
        orderNumber: `T-${++seq}`,
        customerId: customer.id,
        addressId: customer.addressId,
        shippingType: ShippingType.DSH_TRANSPORT,
        items: [{ productId, bultos }],
      },
      admin,
    );
  }

  async function startAs(orderId: string, ...pickers: AuthenticatedUser[]) {
    await picking.assignPickers(orderId, { pickerIds: pickers.map((p) => p.id) }, admin);
    return picking.start(orderId, pickers[0]);
  }

  const inv = (locationId: string) =>
    prisma.inventory.findFirst({ where: { locationId, productId } });

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
    `;
    // stock_movements / audit_logs son inmutables (triggers). Sólo en la base
    // de prueba: se desactivan los triggers de usuario para esta transacción.
    await prisma.$transaction([
      prisma.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`),
      prisma.$executeRawUnsafe(
        `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`,
      ),
    ]);

    admin = await user(UserRole.ADMIN, 'admin');
    manager = await user(UserRole.WAREHOUSE_MANAGER, 'gestor');
    picker1 = await user(UserRole.PICKER, 'juan');
    picker2 = await user(UserRole.PICKER, 'ana');
    checker = await user(UserRole.PICKER, 'control');

    const c = await prisma.customer.create({
      data: {
        customerNumber: 'C1',
        cuit: '30-00000000-1',
        name: 'Cliente Test',
        legalName: 'Cliente Test SA',
        email: 'c@test.local',
        addresses: {
          create: { address: 'Calle 1', city: 'CABA', province: 'Buenos Aires', zipCode: '1000' },
        },
      },
      include: { addresses: true },
    });
    customer = { id: c.id, addressId: c.addresses[0].id };

    productId = (
      await prisma.product.create({
        data: { sku: 'US582', name: 'Bebedero mascotas', unitsPerBox: 50 },
      })
    ).id;
    w1 = (await prisma.warehouse.create({ data: { code: 'W1', name: 'Depósito 1' } })).id;
    w2 = (await prisma.warehouse.create({ data: { code: 'W2', name: 'Depósito 2' } })).id;
  });

  it('vaciado: A=9 / B=20 / pedido 10 -> 9 de A + 1 de B', async () => {
    const a = await location(w1, 'A-01', 'A', '1');
    const b = await location(w1, 'B-01', 'B', '1');
    await stock(w1, a.id, 9);
    await stock(w1, b.id, 20);

    const order = await createOrder(10);
    const tasks = await prisma.pickTask.findMany({
      where: { orderId: order.id },
      orderBy: { sequence: 'asc' },
    });
    expect(tasks.map((t) => [t.locationId, t.quantity])).toEqual([
      [a.id, 9],
      [b.id, 1],
    ]);
    expect((await inv(a.id))!.reserved).toBe(9);
    expect((await inv(b.id))!.reserved).toBe(1);
  });

  it('10 pedidos, 9 tomados, 1 roto, stock en otra ubicación del mismo depósito', async () => {
    const a = await location(w1, 'A-01', 'A', '1');
    await stock(w1, a.id, 10);
    const order = await createOrder(10);
    // Llega stock a otra ubicación después del alta
    const b = await location(w1, 'B-02', 'B', '2');
    await stock(w1, b.id, 5);

    const detail = await startAs(order.id, picker1, picker2);
    const task = detail.pendingTasks[0];

    const res = await picking.confirmTask(
      order.id,
      task.id,
      { quantity: 9, shortReason: PickShortReason.DAMAGED, notes: 'caja aplastada' },
      picker1,
    );

    // Cuarentena: 1 bulto sigue reservado en A; solicitud de ajuste creada
    expect(await inv(a.id)).toMatchObject({ quantity: 1, reserved: 1 });
    const requests = await prisma.stockAdjustmentRequest.findMany();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      pickTaskId: task.id,
      heldQty: 1,
      quantityDelta: -1,
      locationId: a.id,
      warehouseId: w1,
    });
    expect(requests[0].reason).toContain('caja aplastada');

    // Reemplazo en B, mismo depósito, asignado al mismo picker
    expect(res.shortageOutcome).toMatchObject({
      missing: 1,
      quarantined: 1,
      uncovered: 0,
      replacements: [
        expect.objectContaining({ quantity: 1, locationCode: 'B-02', assignedToMe: true }),
      ],
    });
    const replacement = await prisma.pickTask.findUniqueOrThrow({
      where: { id: res.shortageOutcome!.replacements[0].taskId },
    });
    expect(replacement).toMatchObject({
      replacesTaskId: task.id,
      assignedToId: picker1.id,
      status: PickTaskStatus.PENDING,
    });
    expect(await inv(b.id)).toMatchObject({ quantity: 5, reserved: 1 });
    expect(res.status).toBe('IN_PICKING');

    // Idempotencia: segundo "Confirmar con faltante" no duplica nada
    await expect(
      picking.confirmTask(order.id, task.id, { quantity: 9, shortReason: PickShortReason.DAMAGED }, picker1),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.stockAdjustmentRequest.count()).toBe(1);
    expect(await prisma.pickTask.count({ where: { orderId: order.id } })).toBe(2);
    expect(await inv(b.id)).toMatchObject({ reserved: 1 });

    // Se toma el reemplazo: pedido completo, sin faltante en la hoja
    const done = await picking.confirmTask(order.id, replacement.id, { quantity: 1 }, picker1);
    expect(done.status).toBe('PICKED');
    const sheet = await orders.getPrintSheet(order.id, admin);
    expect(sheet.totalBultos).toBe(10);
    expect(sheet.orderedBultos).toBe(10);
    expect(sheet.shortages).toEqual([]);
    expect(sheet.preparedBy).toEqual(['juan Test']);

    // El historial conserva la incidencia original aunque se cubrió
    const full = await orders.findOne(order.id, admin);
    const original = full.pickingHistory.tasks.find((t) => t.id === task.id)!;
    expect(original).toMatchObject({
      shortReason: PickShortReason.DAMAGED,
      notes: 'caja aplastada',
      pickedBy: 'juan Test',
      locationCode: 'A-01',
    });
    expect(full.pickingHistory.byPicker).toEqual([
      expect.objectContaining({ name: 'juan Test', bultos: 10, tasks: 2 }),
    ]);

    // Gestor APRUEBA: se descuenta el bulto roto y se libera la reserva
    await stockRequests.approve(requests[0].id, {}, manager);
    expect(await inv(a.id)).toBeNull(); // quedó en 0/0 y se purgó
    const adj = await prisma.stockMovement.findFirst({ where: { type: 'ADJUSTMENT' } });
    expect(adj).toMatchObject({ quantity: 1, sourceLocationId: a.id });
  });

  it('sin stock en el depósito pero sí en otro: tarea multi-depósito sin asignar', async () => {
    const a = await location(w1, 'A-01', 'A', '1');
    await stock(w1, a.id, 10);
    const order = await createOrder(10);
    const c = await location(w2, 'C-01', 'C', '1');
    await stock(w2, c.id, 3);

    const detail = await startAs(order.id, picker1);
    const res = await picking.confirmTask(
      order.id,
      detail.pendingTasks[0].id,
      { quantity: 9, shortReason: PickShortReason.NOT_FOUND },
      picker1,
    );

    expect(res.shortageOutcome!.replacements).toEqual([
      expect.objectContaining({ quantity: 1, warehouseName: 'Depósito 2', assignedToMe: false }),
    ]);
    const replacement = await prisma.pickTask.findUniqueOrThrow({
      where: { id: res.shortageOutcome!.replacements[0].taskId },
    });
    expect(replacement.assignedToId).toBeNull();
    expect(await inv(c.id)).toMatchObject({ reserved: 1 });

    const sheet = await orders.getPrintSheet(order.id, admin);
    expect(sheet.groups.map((g) => g.warehouse?.name)).toEqual(['Depósito 1', 'Depósito 2']);
    expect(sheet.groups[1].rows[0]).toMatchObject({ replacement: true, bultos: 1 });
  });

  it('sin stock en ningún lado: faltante justificado que pasa Control 1; Gestor rechaza', async () => {
    const a = await location(w1, 'A-01', 'A', '1');
    await stock(w1, a.id, 10);
    const order = await createOrder(10);
    const detail = await startAs(order.id, picker1);

    const res = await picking.confirmTask(
      order.id,
      detail.pendingTasks[0].id,
      { quantity: 9, shortReason: PickShortReason.DAMAGED, notes: 'mojado' },
      picker1,
    );
    expect(res.shortageOutcome).toMatchObject({ uncovered: 1, replacements: [] });
    expect(res.status).toBe('PICKED');

    const sheet = await orders.getPrintSheet(order.id, admin);
    expect(sheet.totalBultos).toBe(9);
    expect(sheet.orderedBultos).toBe(10);
    expect(sheet.shortages).toHaveLength(1);
    expect(sheet.shortages[0].text).toContain(
      'US582 - Bebedero mascotas: se prepararon 9 de 10 bultos (1 en mal estado',
    );
    expect(sheet.shortages[0].text).toContain('mojado');

    // Control 1 deja pasar el faltante justificado
    const item = (await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } })).id;
    const checked = await checking.verifyOrderItems(order.id, checker, {
      itemsChecked: [{ orderItemId: item, quantityChecked: 9 }],
    });
    expect(checked.status).toBe('CHECKED');

    // Gestor RECHAZA (el bulto estaba bien): se libera y vuelve a estar disponible
    const request = await prisma.stockAdjustmentRequest.findFirstOrThrow();
    await stockRequests.reject(request.id, {}, manager);
    expect(await inv(a.id)).toMatchObject({ quantity: 1, reserved: 0 });
  });

  it('Control 1 sigue rechazando un faltante sin motivo (dato histórico)', async () => {
    const a = await location(w1, 'A-01', 'A', '1');
    await stock(w1, a.id, 10);
    const order = await createOrder(10);
    const detail = await startAs(order.id, picker1);
    await picking.confirmTask(
      order.id,
      detail.pendingTasks[0].id,
      { quantity: 9, shortReason: PickShortReason.DAMAGED },
      picker1,
    );
    // Simula una toma vieja sin motivo
    await prisma.pickTask.updateMany({ where: { orderId: order.id }, data: { shortReason: null } });
    const item = (await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } })).id;
    await expect(
      checking.verifyOrderItems(order.id, checker, {
        itemsChecked: [{ orderItemId: item, quantityChecked: 9 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('valida el motivo; con OTHER exige observación y libera la reserva', async () => {
    const a = await location(w1, 'A-01', 'A', '1');
    await stock(w1, a.id, 10);
    const order = await createOrder(10);
    const detail = await startAs(order.id, picker1);
    const taskId = detail.pendingTasks[0].id;

    await expect(
      picking.confirmTask(order.id, taskId, { quantity: 9 }, picker1),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      picking.confirmTask(order.id, taskId, { quantity: 9, shortReason: PickShortReason.OTHER }, picker1),
    ).rejects.toBeInstanceOf(BadRequestException);

    await picking.confirmTask(
      order.id,
      taskId,
      { quantity: 9, shortReason: PickShortReason.OTHER, notes: 'cliente pidió menos' },
      picker1,
    );
    expect(await inv(a.id)).toMatchObject({ quantity: 1, reserved: 0 });
    expect(await prisma.stockAdjustmentRequest.count()).toBe(0);
  });

  it('dos pickers confirmando a la vez sobre el mismo SKU no reservan el mismo bulto', async () => {
    const a = await location(w1, 'A-01', 'A', '1');
    const b = await location(w1, 'B-01', 'B', '1');
    await stock(w1, a.id, 5);
    await stock(w1, b.id, 5);
    const o1 = await createOrder(5);
    const o2 = await createOrder(5);
    // Un único bulto libre para reemplazos
    const c = await location(w1, 'C-01', 'C', '1');
    await stock(w1, c.id, 1);

    const d1 = await startAs(o1.id, picker1);
    const d2 = await startAs(o2.id, picker2);

    const [r1, r2] = await Promise.all([
      picking.confirmTask(o1.id, d1.pendingTasks[0].id, { quantity: 4, shortReason: PickShortReason.DAMAGED }, picker1),
      picking.confirmTask(o2.id, d2.pendingTasks[0].id, { quantity: 4, shortReason: PickShortReason.DAMAGED }, picker2),
    ]);

    const covered = [r1, r2].map((r) => r.shortageOutcome!.replacements.length);
    expect(covered.sort()).toEqual([0, 1]);
    expect([r1, r2].map((r) => r.shortageOutcome!.uncovered).sort()).toEqual([0, 1]);
    expect(await inv(c.id)).toMatchObject({ quantity: 1, reserved: 1 });
    expect(await prisma.stockAdjustmentRequest.count()).toBe(2);
    // Invariante de la base: reserved <= quantity en todo el inventario
    const broken = await prisma.$queryRaw<Array<{ n: bigint }>>(
      Prisma.sql`SELECT COUNT(*) AS n FROM inventories WHERE reserved > quantity OR reserved < 0`,
    );
    expect(Number(broken[0].n)).toBe(0);
  });
});
