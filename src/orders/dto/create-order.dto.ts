import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
  ArrayMinSize,
  IsInt,
  Min,
  IsEnum,
  IsDateString,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Currency, PaymentTerm } from '@prisma/client';

export class CreateOrderItemDto {
  @IsUUID()
  @IsNotEmpty()
  productId: string;

  @IsInt()
  @Min(1)
  bultos: number; // Cantidad de bultos pedidos

  @IsNumber()
  @IsOptional()
  unitPrice?: number;
}

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  orderNumber: string; // Número único (Ej: Presupuesto 1900)

  @IsUUID()
  @IsNotEmpty()
  customerId: string;

  @IsUUID()
  @IsNotEmpty()
  addressId: string; // Dirección elegida de las registradas para el cliente

  @IsUUID()
  @IsNotEmpty()
  sourceWarehouseId: string; // Depósito de origen

  @IsUUID()
  @IsOptional()
  sellerId?: string;

  @IsUUID()
  @IsOptional()
  transportId?: string; // Opcional para envíos por transporte externo

  @IsEnum(Currency)
  @IsNotEmpty()
  currency: Currency;

  @IsEnum(PaymentTerm)
  @IsNotEmpty()
  paymentTerm: PaymentTerm;

  @IsDateString()
  @IsOptional()
  deliveryDateFrom?: string;

  @IsDateString()
  @IsOptional()
  deliveryDateTo?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}
