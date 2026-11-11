// dsh-logistica/src/products/products.controller.ts

import {
  Controller,
  Get,
  Query,
  ParseUUIDPipe,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { Permission } from '../auth/permissions';
import { GetUser } from '../auth/decorators/get-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { canViewMoney } from '../common/sales';

@Controller('products')
@RequirePermissions(Permission.ORDERS_MANAGE, Permission.INVENTORY_VIEW)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  search(
    @GetUser() user: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('warehouseId', new ParseUUIDPipe({ optional: true }))
    warehouseId?: string,
    @Query('limit', new DefaultValuePipe(30), ParseIntPipe) limit?: number,
  ) {
    return this.productsService.search({
      search,
      warehouseId,
      limit,
      includePrices: canViewMoney(user.role),
    });
  }
}
