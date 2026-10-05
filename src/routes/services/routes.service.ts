import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRouteDto } from '../dto/create-route.dto';

@Injectable()
export class RoutesService {
  constructor(private readonly prisma: PrismaService) {}

  async createRoute(createRouteDto: CreateRouteDto) {
    const { code, driverId, vehicleInfo, scheduledDate, orderIds } =
      createRouteDto;

    // 1. Validar unicidad del código de la hoja de ruta
    const existingRoute = await this.prisma.route.findUnique({
      where: { code },
    });

    if (existingRoute) {
      throw new ConflictException(
        `Ya existe una hoja de ruta con el código "${code}".`,
      );
    }

    // 2. Validar que el chofer exista y esté activo
    const driver = await this.prisma.user.findUnique({
      where: { id: driverId },
    });

    if (!driver || !driver.isActive) {
      throw new BadRequestException(
        `El chofer asignado no existe o no está activo.`,
      );
    }

    // 3. PUNTO DE CONTROL 2: Validar que todos los pedidos estén auditados en estado CHECKED
    const orders = await this.prisma.order.findMany({
      where: {
        id: { in: orderIds },
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (orders.length !== orderIds.length) {
      throw new NotFoundException(
        `Uno o más pedidos indicados no fueron encontrados.`,
      );
    }

    const uncheckedOrders = orders.filter((o) => o.status !== 'CHECKED');
    if (uncheckedOrders.length > 0) {
      throw new BadRequestException(
        `No se pueden cargar al camión pedidos sin control de armado previo (Estado CHECKED obligatorio). Pedidos pendientes de control: ${uncheckedOrders.map((o) => o.orderNumber).join(', ')}`,
      );
    }

    // 4. Consolidador de bultos y masa total en Kilogramos para la unidad de transporte
    const routeTotalBultos = orders.reduce((sum, o) => sum + o.totalBultos, 0);
    const routeTotalWeightKg = orders.reduce(
      (sum, o) => sum + Number(o.totalWeightKg),
      0,
    );

    // 5. Transacción atómica: Crear hoja de ruta y marcar pedidos como DISPATCHED
    return this.prisma.$transaction(async (tx) => {
      const route = await tx.route.create({
        data: {
          code,
          driverId,
          vehicleInfo: vehicleInfo ?? null,
          scheduledDate: new Date(scheduledDate),
          status: 'PLANNED',
        },
      });

      await tx.order.updateMany({
        where: {
          id: { in: orderIds },
        },
        data: {
          routeId: route.id,
          status: 'DISPATCHED',
        },
      });

      const fullRoute = await tx.route.findUnique({
        where: { id: route.id },
        include: {
          driver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          orders: {
            include: {
              customer: true,
              deliveryAddress: true,
              transport: true,
            },
          },
        },
      });

      return {
        ...fullRoute,
        summary: {
          totalOrders: orders.length,
          totalBultos: routeTotalBultos,
          totalWeightKg: routeTotalWeightKg,
        },
      };
    });
  }

  async findAll() {
    return this.prisma.route.findMany({
      include: {
        driver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        orders: {
          include: {
            customer: true,
            deliveryAddress: true,
            transport: true,
          },
        },
      },
      orderBy: { scheduledDate: 'desc' },
    });
  }

  async findMyDriverRoutes(driverId: string) {
    return this.prisma.route.findMany({
      where: { driverId },
      include: {
        orders: {
          include: {
            customer: {
              include: {
                addresses: true,
              },
            },
            deliveryAddress: true,
            transport: true,
            items: {
              include: {
                product: true,
              },
            },
          },
        },
      },
      orderBy: { scheduledDate: 'asc' },
    });
  }
}
