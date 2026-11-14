import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { GetUser } from '../auth/decorators/get-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER)
  create(
    @Body() createCustomerDto: CreateCustomerDto,
    @GetUser() user: AuthenticatedUser,
  ) {
    return this.customersService.create(createCustomerDto, user);
  }

  /** El Vendedor sólo recibe su cartera y los clientes sin vendedor de cuenta. */
  @Get()
  @Roles(
    UserRole.ADMIN,
    UserRole.WAREHOUSE_MANAGER,
    UserRole.PICKER,
    UserRole.SELLER,
  )
  findAll(
    @GetUser() user: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('isActive') isActive?: boolean,
  ) {
    return this.customersService.findAll(
      { search, page, limit, isActive },
      user,
    );
  }

  @Get(':id')
  @Roles(
    UserRole.ADMIN,
    UserRole.WAREHOUSE_MANAGER,
    UserRole.PICKER,
    UserRole.SELLER,
  )
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @GetUser() user: AuthenticatedUser,
  ) {
    return this.customersService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_MANAGER)
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateCustomerDto: UpdateCustomerDto,
    @GetUser() user: AuthenticatedUser,
  ) {
    return this.customersService.update(id, updateCustomerDto, user);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @GetUser() user: AuthenticatedUser,
  ) {
    return this.customersService.remove(id, user);
  }
}
