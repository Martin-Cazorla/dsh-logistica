// dsh-logistica/src/inventory/dto/adjust-stock.dto.ts

import {
  IsUUID,
  IsInt,
  Min,
  IsString,
  MinLength,
  MaxLength,
} from 'class-validator';

/**
 * Descuento manual de stock (rotura, faltante, muestra, etc.).
 * Reemplaza el "ajuste local" en localStorage del frontend, que dejaba el stock
 * real de la BD sin modificar y sin auditoría.
 */
export class AdjustStockDto {
  @IsUUID()
  inventoryId: string;

  @IsInt()
  @Min(1)
  quantityBultos: number;

  @IsString()
  @MinLength(3)
  @MaxLength(255)
  reason: string;
}
