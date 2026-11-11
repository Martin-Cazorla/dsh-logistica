// dsh-logistica/src/inventory/dto/stock-request.dto.ts

import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { StockRequestStatus, StockRequestType } from '@prisma/client';

/**
 * Solicitud de modificación de stock por un operario sin permiso de
 * modificación directa (PICKER):
 *  - COUNT: informa la cantidad física contada (countedQty).
 *  - ADJUSTMENT: solicita descontar `quantity` bultos (rotura, faltante...).
 * El stock NO cambia hasta que un Gestor/Administrador la aprueba.
 */
export class CreateStockRequestDto {
  @IsUUID()
  inventoryId: string;

  @IsEnum(StockRequestType)
  type: StockRequestType;

  @ValidateIf((o: CreateStockRequestDto) => o.type === StockRequestType.COUNT)
  @IsInt()
  @Min(0)
  countedQty?: number;

  @ValidateIf(
    (o: CreateStockRequestDto) => o.type === StockRequestType.ADJUSTMENT,
  )
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsString()
  @MinLength(3)
  @MaxLength(255)
  reason: string;
}

export class ReviewStockRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;
}

export class ListStockRequestsQueryDto {
  @IsOptional()
  @IsEnum(StockRequestStatus)
  status?: StockRequestStatus;
}
