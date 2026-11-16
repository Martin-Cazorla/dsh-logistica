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
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  Currency,
  OrderStatus,
  PaymentTerm,
  ShippingType,
} from '@prisma/client';

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
  /**
   * N° de presupuesto del sistema externo. Es el número de pedido visible
   * (único).
   */
  @IsString()
  @IsNotEmpty({ message: 'Indique el número de presupuesto.' })
  @MaxLength(50)
  orderNumber: string;

  @IsUUID()
  customerId: string;

  @IsUUID()
  addressId: string; // Dirección de entrega registrada del cliente

  /**
   * Vendedor del pedido (opcional). Si carga un Vendedor se ignora y se usa
   * el usuario logueado; enviar otro vendedor responde 403. Validado en
   * OrdersService.
   */
  @IsUUID()
  @IsOptional()
  sellerId?: string;

  /** Transporte DSH (propio) o Expreso. */
  @IsEnum(ShippingType, { message: 'Seleccione el tipo de envío.' })
  shippingType: ShippingType;

  /** Expreso que realiza el envío: obligatorio si shippingType = EXPRESO. */
  @ValidateIf((o: CreateOrderDto) => o.shippingType === ShippingType.EXPRESO)
  @IsUUID('all', { message: 'Seleccione el expreso.' })
  transportId?: string;

  @IsDateString()
  @IsOptional()
  estimatedDeliveryDate?: string;

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
