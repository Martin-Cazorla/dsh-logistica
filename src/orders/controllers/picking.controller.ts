import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import { UserRole } from '@prisma/client';
import { PickingService } from '../services/picking.service';
import { ProcessPickingDto } from '../dto/picking-order.dto';

@Controller('orders/picking')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class PickingController {
  constructor(private readonly pickingService: PickingService) {}

  @Get('my-list')
  @Roles(UserRole.PICKER, UserRole.WAREHOUSE_MANAGER, UserRole.ADMIN)
  async getMyPendingPickings(@GetUser('id') pickerId: string) {
    return this.pickingService.getMyPendingPickings(pickerId);
  }

  @Post(':id/start')
  @Roles(UserRole.WAREHOUSE_MANAGER, UserRole.ADMIN, UserRole.PICKER)
  async startPicking(
    @Param('id', new ParseUUIDPipe()) orderId: string,
    @GetUser('id') currentUserId: string,
  ) {
    return this.pickingService.assignAndStartPicking(orderId, currentUserId);
  }

  @Post(':id/confirm')
  @Roles(UserRole.PICKER, UserRole.WAREHOUSE_MANAGER, UserRole.ADMIN)
  async confirmPicking(
    @Param('id', new ParseUUIDPipe()) orderId: string,
    @GetUser('id') currentUserId: string,
    @Body() processPickingDto: ProcessPickingDto,
  ) {
    return this.pickingService.confirmPicking(
      orderId,
      currentUserId,
      processPickingDto,
    );
  }
}
