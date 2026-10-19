// dsh-logistica/src/inventory/dto/create-manual-stock.dto.ts

import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ManualStockItemDto {
  @IsString()
  @IsNotEmpty()
  productSku: string;

  @IsString()
  @IsNotEmpty()
  productName: string;

  @IsNumber()
  @Min(1)
  quantityBultos: number;

  @IsNumber()
  @Min(1)
  @IsOptional()
  unitsPerBox?: number;

  @IsNumber()
  @IsOptional()
  weightPerBultoKg?: number;

  @IsNumber()
  @IsOptional()
  volumePerBultoM3?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateManualStockDto {
  @IsString()
  @IsNotEmpty()
  warehouseId: string;

  @IsString()
  @IsNotEmpty()
  locationId: string;

  @IsString()
  @IsOptional()
  entryDate?: string;

  @IsString()
  @IsOptional()
  userId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManualStockItemDto)
  items: ManualStockItemDto[];
}
