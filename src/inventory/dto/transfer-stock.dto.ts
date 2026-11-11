// dsh-logistica/src/inventory/dto/transfer-stock.dto.ts

import {
  IsUUID,
  IsInt,
  Min,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Reubicación de stock (misma ubicación de depósito o inter-depósito).
 * Contrato alineado con frontend/src/services/inventory.service.ts#transferStock.
 *
 * Antes existía un TransferStockDto que el controlador NO usaba (recibía un
 * tipo inline sin validación) y cuyos campos no coincidían con lo que enviaba
 * el frontend.
 */
export class TransferStockDto {
  @IsUUID()
  inventoryId: string;

  @IsUUID()
  targetLocationId: string;

  /** Ignorado: el depósito destino se deriva siempre de la ubicación destino. */
  @IsOptional()
  @IsUUID()
  targetWarehouseId?: string;

  @IsInt()
  @Min(1)
  quantityBultos: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;
}
