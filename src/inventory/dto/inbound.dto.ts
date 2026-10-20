// dsh-logistica/src/inventory/dto/inbound.dto.ts

import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
  IsBoolean,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ComboComponentDto {
  @IsString()
  childSku: string;

  @IsString()
  description: string;

  @IsNumber()
  @Min(1)
  quantityPerCombo: number;
}

export class InboundItemDto {
  @IsString()
  productSku: string;

  @IsString()
  productName: string;

  @IsNumber()
  @Min(1)
  quantityBultos: number;

  @IsOptional()
  @IsNumber()
  unitsPerBox?: number;

  @IsOptional()
  @IsNumber()
  weightPerBultoKg?: number;

  @IsOptional()
  @IsNumber()
  volumePerBultoM3?: number;

  @IsOptional()
  @IsNumber()
  sampleUnits?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsBoolean()
  isCombo?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComboComponentDto)
  components?: ComboComponentDto[];
}

export class InboundDto {
  @IsString()
  containerNumber: string;

  @IsString()
  warehouseId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InboundItemDto)
  items: InboundItemDto[];
}

export class CreateWarehouseDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  address?: string;
}
