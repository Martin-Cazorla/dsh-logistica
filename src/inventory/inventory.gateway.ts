// dsh-logistica/src/inventory/inventory.gateway.ts

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

interface LockPayload {
  containerId: string;
  sku: string;
  userName: string;
  userId: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class InventoryGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  // Mapa en memoria para seguir qué SKU está bloqueado por qué usuario
  // Key: containerId:sku -> Value: { socketId, userName, userId }
  private activeLocks = new Map<
    string,
    { socketId: string; userName: string; userId: string }
  >();

  handleConnection(client: Socket) {
    console.log(`[WebSocket] Operario conectado: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`[WebSocket] Operario desconectado: ${client.id}`);

    // Al desconectarse, liberar todos los bloqueos que tenía este socket
    for (const [key, lock] of this.activeLocks.entries()) {
      if (lock.socketId === client.id) {
        this.activeLocks.delete(key);
        const [containerId, sku] = key.split(':');
        this.server.emit('item_unlocked', { containerId, sku });
      }
    }
  }

  @SubscribeMessage('join_container')
  handleJoinContainer(
    @ConnectedSocket() client: Socket,
    @MessageBody() containerId: string,
  ) {
    client.join(`container_${containerId}`);

    // Enviar al cliente que se conecta los bloqueos actuales del contenedor
    const locksForContainer: Record<
      string,
      { userName: string; userId: string }
    > = {};
    for (const [key, lock] of this.activeLocks.entries()) {
      if (key.startsWith(`${containerId}:`)) {
        const sku = key.split(':')[1];
        locksForContainer[sku] = {
          userName: lock.userName,
          userId: lock.userId,
        };
      }
    }

    client.emit('current_locks', locksForContainer);
  }

  @SubscribeMessage('lock_item')
  handleLockItem(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: LockPayload,
  ) {
    const key = `${payload.containerId}:${payload.sku}`;

    // Si no está bloqueado por otro, asignarlo
    if (!this.activeLocks.has(key)) {
      this.activeLocks.set(key, {
        socketId: client.id,
        userName: payload.userName,
        userId: payload.userId,
      });

      this.server.to(`container_${payload.containerId}`).emit('item_locked', {
        sku: payload.sku,
        userName: payload.userName,
        userId: payload.userId,
      });
    }
  }

  @SubscribeMessage('unlock_item')
  handleUnlockItem(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { containerId: string; sku: string },
  ) {
    const key = `${payload.containerId}:${payload.sku}`;
    const lock = this.activeLocks.get(key);

    if (lock && lock.socketId === client.id) {
      this.activeLocks.delete(key);
      this.server.to(`container_${payload.containerId}`).emit('item_unlocked', {
        sku: payload.sku,
      });
    }
  }

  @SubscribeMessage('item_controlled_toggle')
  handleItemControlledToggle(
    @MessageBody()
    payload: {
      containerId: string;
      sku: string;
      isControlled: boolean;
      userName: string;
    },
  ) {
    // Sincronizar actualización a todos los operarios en tiempo real
    this.server
      .to(`container_${payload.containerId}`)
      .emit('item_status_updated', payload);
  }
}
