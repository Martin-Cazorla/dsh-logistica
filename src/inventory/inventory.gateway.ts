// dsh-logistica/src/inventory/inventory.gateway.ts

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { isOriginAllowed } from '../common/cors';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

interface SocketData {
  user: AuthenticatedUser;
}

type AuthedSocket = Socket & { data: SocketData };

interface ItemLock {
  socketId: string;
  userId: string;
  userName: string;
  expiresAt: number;
}

interface LockAck {
  ok: boolean;
  lockedBy?: { userId: string; userName: string };
  error?: string;
}

const OCCUPANCY_ROOM = 'occupancy';
const LOCK_TTL_MS = 10 * 60 * 1000; // 10 min sin renovar => se libera
const LOCK_SWEEP_INTERVAL_MS = 60 * 1000;
const OCCUPANCY_DEBOUNCE_MS = 500;
const MAX_ID_LENGTH = 100;

function isNonEmptyString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= MAX_ID_LENGTH
  );
}

function containerRoom(containerId: string) {
  return `container_${containerId}`;
}

/**
 * Gateway en tiempo real para:
 *  1. Bloqueos colaborativos de ítems durante el control físico de contenedores.
 *  2. Notificación de cambios de ocupación de depósitos (occupancy_updated).
 *
 * Cambios clave respecto de la versión anterior:
 *  - Autenticación JWT en el handshake (antes cualquier cliente sin token podía
 *    conectarse, leer bloqueos y suplantar a otro operario enviando su userId).
 *  - La identidad (userId/userName) se toma del token, nunca del payload.
 *  - CORS restringido a CORS_ORIGINS (antes origin: '*').
 *  - Locks con TTL: un navegador colgado ya no bloquea un SKU indefinidamente.
 *  - Eventos acotados a la sala del contenedor (antes el disconnect emitía
 *    'item_unlocked' a todos los clientes conectados).
 *  - Respuesta ack en lock_item para que el cliente sepa si obtuvo el lock.
 *
 * Nota de escalado: los locks viven en memoria del proceso. Con más de una
 * instancia del backend se requiere @socket.io/redis-adapter y un store de
 * locks compartido (Redis SET NX PX).
 */
@WebSocketGateway({
  cors: {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => callback(null, isOriginAllowed(origin)),
    credentials: true,
  },
})
export class InventoryGateway
  implements
    OnGatewayInit<Server>,
    OnGatewayConnection<AuthedSocket>,
    OnGatewayDisconnect<AuthedSocket>,
    OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(InventoryGateway.name);

  // Key: `${containerId}:${sku}`
  private readonly activeLocks = new Map<string, ItemLock>();

  private sweepTimer?: NodeJS.Timeout;
  private occupancyTimer?: NodeJS.Timeout;
  private readonly pendingOccupancyWarehouses = new Set<string>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  // ---------------------------------------------------------------------------
  // CICLO DE VIDA
  // ---------------------------------------------------------------------------

  afterInit(server: Server) {
    // Middleware de handshake: rechaza la conexión antes de que llegue a los
    // handlers si el token no es válido o el usuario está inactivo.
    server.use((socket, next) => {
      this.authenticate(socket as AuthedSocket)
        .then(() => next())
        .catch(() => next(new Error('UNAUTHORIZED')));
    });

    this.sweepTimer = setInterval(
      () => this.sweepExpiredLocks(),
      LOCK_SWEEP_INTERVAL_MS,
    );
    this.sweepTimer.unref();
  }

  onModuleDestroy() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    if (this.occupancyTimer) clearTimeout(this.occupancyTimer);
  }

  handleConnection(client: AuthedSocket) {
    const user = client.data.user;
    void client.join(OCCUPANCY_ROOM);
    this.logger.debug(
      `Operario conectado: ${user?.fullName ?? 'desconocido'} (${client.id})`,
    );
  }

  handleDisconnect(client: AuthedSocket) {
    this.logger.debug(`Operario desconectado: ${client.id}`);
    this.releaseLocks((lock) => lock.socketId === client.id);
  }

  // ---------------------------------------------------------------------------
  // SALAS DE CONTENEDOR
  // ---------------------------------------------------------------------------

  @SubscribeMessage('join_container')
  handleJoinContainer(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() containerId: unknown,
  ) {
    if (!isNonEmptyString(containerId)) {
      return { ok: false, error: 'containerId inválido' };
    }

    // Un operario trabaja un contenedor a la vez: abandona salas previas y
    // libera los locks que tuviera en ellas.
    for (const room of client.rooms) {
      if (
        room.startsWith('container_') &&
        room !== containerRoom(containerId)
      ) {
        void client.leave(room);
        const previousId = room.slice('container_'.length);
        this.releaseLocks(
          (lock, key) =>
            lock.socketId === client.id && key.startsWith(`${previousId}:`),
        );
      }
    }

    void client.join(containerRoom(containerId));
    client.emit('current_locks', this.getLocksForContainer(containerId));
    return { ok: true };
  }

  @SubscribeMessage('leave_container')
  handleLeaveContainer(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() containerId: unknown,
  ) {
    if (!isNonEmptyString(containerId)) {
      return { ok: false, error: 'containerId inválido' };
    }
    void client.leave(containerRoom(containerId));
    this.releaseLocks(
      (lock, key) =>
        lock.socketId === client.id && key.startsWith(`${containerId}:`),
    );
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // BLOQUEOS DE ÍTEMS
  // ---------------------------------------------------------------------------

  @SubscribeMessage('lock_item')
  handleLockItem(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: unknown,
  ): LockAck {
    const parsed = this.parseItemRef(payload);
    if (!parsed) return { ok: false, error: 'Payload inválido' };

    const { containerId, sku } = parsed;
    if (!client.rooms.has(containerRoom(containerId))) {
      return {
        ok: false,
        error: 'Debe unirse al contenedor antes de bloquear',
      };
    }

    const user = client.data.user;
    const key = `${containerId}:${sku}`;
    const existing = this.activeLocks.get(key);
    const now = Date.now();

    // Map de JS + event loop de un solo hilo: check-and-set atómico dentro de
    // este proceso.
    if (existing && existing.expiresAt > now && existing.userId !== user.id) {
      return {
        ok: false,
        lockedBy: { userId: existing.userId, userName: existing.userName },
      };
    }

    const isRenewal =
      existing !== undefined &&
      existing.userId === user.id &&
      existing.expiresAt > now;

    this.activeLocks.set(key, {
      socketId: client.id,
      userId: user.id,
      userName: user.fullName,
      expiresAt: now + LOCK_TTL_MS,
    });

    if (!isRenewal) {
      this.server.to(containerRoom(containerId)).emit('item_locked', {
        sku,
        userName: user.fullName,
        userId: user.id,
      });
    }

    return { ok: true };
  }

  @SubscribeMessage('unlock_item')
  handleUnlockItem(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: unknown,
  ) {
    const parsed = this.parseItemRef(payload);
    if (!parsed) return { ok: false, error: 'Payload inválido' };

    const key = `${parsed.containerId}:${parsed.sku}`;
    const lock = this.activeLocks.get(key);

    if (lock && lock.userId === client.data.user.id) {
      this.activeLocks.delete(key);
      this.server
        .to(containerRoom(parsed.containerId))
        .emit('item_unlocked', { sku: parsed.sku });
    }
    return { ok: true };
  }

  @SubscribeMessage('item_controlled_toggle')
  handleItemControlledToggle(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: unknown,
  ) {
    const parsed = this.parseItemRef(payload);
    const isControlled =
      typeof payload === 'object' &&
      payload !== null &&
      typeof (payload as { isControlled?: unknown }).isControlled === 'boolean'
        ? (payload as { isControlled: boolean }).isControlled
        : null;

    if (!parsed || isControlled === null) {
      return { ok: false, error: 'Payload inválido' };
    }

    const user = client.data.user;
    const lock = this.activeLocks.get(`${parsed.containerId}:${parsed.sku}`);

    // Sólo quien tiene el ítem bloqueado (o nadie lo tiene) puede marcarlo.
    if (lock && lock.expiresAt > Date.now() && lock.userId !== user.id) {
      return {
        ok: false,
        error: `El ítem está siendo controlado por ${lock.userName}`,
      };
    }

    this.server
      .to(containerRoom(parsed.containerId))
      .emit('item_status_updated', {
        containerId: parsed.containerId,
        sku: parsed.sku,
        isControlled,
        userName: user.fullName,
      });
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // OCUPACIÓN EN TIEMPO REAL (invocado por servicios de dominio)
  // ---------------------------------------------------------------------------

  /**
   * Notifica que la ocupación de uno o más depósitos cambió. Se agrupa
   * (debounce) para que un inbound de 200 líneas no dispare 200 recargas en
   * cada cliente.
   */
  emitOccupancyChanged(warehouseIds: string[]) {
    if (!this.server) return;
    for (const id of warehouseIds) {
      if (id) this.pendingOccupancyWarehouses.add(id);
    }
    if (this.pendingOccupancyWarehouses.size === 0 || this.occupancyTimer) {
      return;
    }

    this.occupancyTimer = setTimeout(() => {
      const ids = [...this.pendingOccupancyWarehouses];
      this.pendingOccupancyWarehouses.clear();
      this.occupancyTimer = undefined;
      this.server
        .to(OCCUPANCY_ROOM)
        .emit('occupancy_updated', { warehouseIds: ids, at: Date.now() });
    }, OCCUPANCY_DEBOUNCE_MS);
  }

  // ---------------------------------------------------------------------------
  // AUXILIARES
  // ---------------------------------------------------------------------------

  private async authenticate(socket: AuthedSocket) {
    const authToken = (socket.handshake.auth as { token?: unknown })?.token;
    const header = socket.handshake.headers.authorization;
    const token =
      typeof authToken === 'string'
        ? authToken
        : typeof header === 'string' && header.startsWith('Bearer ')
          ? header.slice(7)
          : null;

    if (!token) throw new Error('Token ausente');

    const payload = await this.jwtService.verifyAsync<{ sub: string }>(token);

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) throw new Error('Usuario inválido');

    socket.data.user = {
      ...user,
      fullName: `${user.firstName} ${user.lastName}`.trim(),
    };
  }

  private parseItemRef(
    payload: unknown,
  ): { containerId: string; sku: string } | null {
    if (typeof payload !== 'object' || payload === null) return null;
    const { containerId, sku } = payload as {
      containerId?: unknown;
      sku?: unknown;
    };
    if (!isNonEmptyString(containerId) || !isNonEmptyString(sku)) return null;
    return { containerId, sku };
  }

  private getLocksForContainer(containerId: string) {
    const now = Date.now();
    const locks: Record<string, { userName: string; userId: string }> = {};
    for (const [key, lock] of this.activeLocks.entries()) {
      if (key.startsWith(`${containerId}:`) && lock.expiresAt > now) {
        locks[key.slice(containerId.length + 1)] = {
          userName: lock.userName,
          userId: lock.userId,
        };
      }
    }
    return locks;
  }

  private releaseLocks(predicate: (lock: ItemLock, key: string) => boolean) {
    for (const [key, lock] of Array.from(this.activeLocks.entries())) {
      if (!predicate(lock, key)) continue;
      this.activeLocks.delete(key);
      const separator = key.indexOf(':');
      const containerId = key.slice(0, separator);
      const sku = key.slice(separator + 1);
      this.server
        ?.to(containerRoom(containerId))
        .emit('item_unlocked', { sku });
    }
  }

  private sweepExpiredLocks() {
    const now = Date.now();
    this.releaseLocks((lock) => lock.expiresAt <= now);
  }
}
