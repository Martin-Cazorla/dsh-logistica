// dsh-logistica/src/orders/dto/create-order.dto.ts

import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
  IsInt,
  Min,
  Max,
  IsEnum,
  IsDateString,
  IsNumber,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Currency, OrderStatus, PaymentTerm } from '@prisma/client';

export class CreateOrderItemDto {
  @IsUUID()
  productId: string;

  @IsInt()
  @Min(1)
  bultos: number; // Cantidad de bultos pedidos

  /**
   * Módulo de Ventas (opcional). Se ignora mientras SALES_MODULE_ENABLED no
   * sea 'true'.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountPct?: number;
}

export class CreateOrderDto {
  /** Si se omite, el sistema genera uno (PED-AAAAMMDD-XXXXXX). */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  orderNumber?: string;

  @IsUUID()
  customerId: string;

  @IsUUID()
  addressId: string; // Dirección de entrega registrada del cliente

  @IsUUID()
  sourceWarehouseId: string; // Depósito de origen

  @IsUUID()
  @IsOptional()
  sellerId?: string;

  @IsUUID()
  @IsOptional()
  transportId?: string; // Envío por transporte externo

  @IsEnum(Currency)
  @IsOptional()
  currency?: Currency;

  @IsEnum(PaymentTerm)
  @IsOptional()
  paymentTerm?: PaymentTerm;

  @IsDateString()
  @IsOptional()
  deliveryDateFrom?: string;

  @IsDateString()
  @IsOptional()
  deliveryDateTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /** Módulo de Ventas (opcional): alícuota de impuesto sobre el subtotal. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  taxPct?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}

export class ListOrdersQueryDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class CancelOrderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reason: string;
}
