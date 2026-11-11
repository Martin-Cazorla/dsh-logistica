// dsh-logistica/src/orders/controllers/picking.controller.ts

import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { Permission } from '../../auth/permissions';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { PickingService } from '../services/picking.service';
import { AssignPickersDto, ConfirmPickTaskDto } from '../dto/picking-order.dto';

@Controller('orders/picking')
@RequirePermissions(Permission.PICKING_EXECUTE)
export class PickingController {
  constructor(private readonly pickingService: PickingService) {}

  @Get('my-list')
  getMyPickings(@GetUser() user: AuthenticatedUser) {
    return this.pickingService.getMyPickings(user);
  }

  @Get(':id')
  getDetail(
    @Param('id', new ParseUUIDPipe()) orderId: string,
    @GetUser() user: AuthenticatedUser,
  ) {
    return this.pickingService.getDetail(orderId, user);
  }

  @Put(':id/pickers')
  @RequirePermissions(Permission.PICKING_ASSIGN)
  assignPickers(
    @Param('id', new ParseUUIDPipe()) orderId: string,
    @Body() dto: AssignPickersDto,
    @GetUser() user: AuthenticatedUser,
  ) {
    return this.pickingService.assignPickers(orderId, dto, user);
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  start(
    @Param('id', new ParseUUIDPipe()) orderId: string,
    @GetUser() user: AuthenticatedUser,
  ) {
    return this.pickingService.start(orderId, user);
  }

  @Post(':id/tasks/:taskId/confirm')
  @HttpCode(HttpStatus.OK)
  confirmTask(
    @Param('id', new ParseUUIDPipe()) orderId: string,
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
    @Body() dto: ConfirmPickTaskDto,
    @GetUser() user: AuthenticatedUser,
  ) {
    return this.pickingService.confirmTask(orderId, taskId, dto, user);
  }

  @Post(':id/reset-plan')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.PICKING_ASSIGN)
  resetPlan(
    @Param('id', new ParseUUIDPipe()) orderId: string,
    @GetUser() user: AuthenticatedUser,
  ) {
    return this.pickingService.resetPlan(orderId, user);
  }
}
