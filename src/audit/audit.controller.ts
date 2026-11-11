// dsh-logistica/src/audit/audit.controller.ts

import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Permission } from '../auth/permissions';

@Controller('audit')
@RequirePermissions(Permission.AUDIT_VIEW)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  find(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditService.find({
      entityType,
      entityId,
      userId,
      action,
      from,
      to,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
