// dsh-logistica/src/audit/audit.service.ts

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuditActionType, AuditEntityType } from './audit.actions';

type Writer = Prisma.TransactionClient | PrismaService;

export interface AuditEntry {
  actor: Pick<AuthenticatedUser, 'id' | 'role'> | null;
  action: AuditActionType;
  entityType: AuditEntityType;
  entityId: string;
  metadata?: Record<string, unknown>;
}

export interface AuditQuery {
  entityType?: string;
  entityId?: string;
  userId?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

/**
 * Registro de auditoría append-only. Se recomienda invocar `log()` con el
 * cliente de la transacción (`tx`) para que el registro se confirme o revierta
 * junto con la operación auditada (no quedan acciones sin rastro ni rastros de
 * acciones que no ocurrieron). La tabla tiene triggers que impiden
 * UPDATE/DELETE/TRUNCATE.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry, writer: Writer = this.prisma): Promise<void> {
    await writer.auditLog.create({
      data: {
        userId: entry.actor?.id ?? null,
        userRole: entry.actor?.role ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: entry.metadata
          ? (JSON.parse(
              JSON.stringify(entry.metadata),
            ) as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
  }

  async logMany(entries: AuditEntry[], writer: Writer = this.prisma) {
    if (entries.length === 0) return;
    await writer.auditLog.createMany({
      data: entries.map((entry) => ({
        userId: entry.actor?.id ?? null,
        userRole: entry.actor?.role ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: entry.metadata
          ? (JSON.parse(
              JSON.stringify(entry.metadata),
            ) as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      })),
    });
  }

  async find(query: AuditQuery) {
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
    const page = Math.max(Number(query.page) || 1, 1);

    const where: Prisma.AuditLogWhereInput = {};
    if (query.entityType) where.entityType = query.entityType;
    if (query.entityId) where.entityId = query.entityId;
    if (query.userId) where.userId = query.userId;
    if (query.action) where.action = query.action;
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        metadata: r.metadata,
        userId: r.userId,
        userRole: r.userRole,
        userName: r.user
          ? `${r.user.firstName} ${r.user.lastName}`.trim()
          : 'Sistema',
        createdAt: r.createdAt,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
