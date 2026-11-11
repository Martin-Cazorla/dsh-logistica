// dsh-logistica/src/inventory/dto/create-manual-stock.dto.ts

import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsInt,
  Min,
  IsOptional,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ManualStockItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  productSku: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  productName: string;

  @IsInt()
  @Min(1)
  quantityBultos: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  unitsPerBox?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  weightPerBultoKg?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  volumePerBultoM3?: number;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  notes?: string;
}

export class CreateManualStockDto {
  /** Ignorado: el depósito se deriva de la ubicación (se mantiene por compatibilidad). */
  @IsUUID()
  @IsOptional()
  warehouseId?: string;

  @IsUUID()
  locationId: string;

  @IsString()
  @IsOptional()
  entryDate?: string;

  /**
   * @deprecated Ignorado. El usuario responsable se toma del JWT.
   * Se acepta para no romper clientes que aún lo envían.
   */
  @IsString()
  @IsOptional()
  userId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ManualStockItemDto)
  items: ManualStockItemDto[];
}
