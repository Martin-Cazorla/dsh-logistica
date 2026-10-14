// src/inventory/dto/inbound.dto.ts

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateWarehouseDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre del depósito es obligatorio.' })
  name: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  address?: string;
}

export class InboundItemDto {
  @IsString()
  @IsNotEmpty()
  productSku: string;

  @IsString()
  @IsNotEmpty()
  productName: string;

  @IsString()
  @IsOptional()
  eanCode?: string;

  @IsNumber()
  quantityBultos: number;

  @IsNumber()
  @IsOptional()
  unitsPerBox?: number;

  @IsNumber()
  weightPerBultoKg: number;

  @IsNumber()
  @IsOptional()
  lengthCm?: number;

  @IsNumber()
  @IsOptional()
  widthCm?: number;

  @IsNumber()
  @IsOptional()
  heightCm?: number;

  @IsNumber()
  volumePerBultoM3: number;

  @IsNumber()
  @IsOptional()
  sampleUnits?: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsNotEmpty()
  locationId: string;
}

export class InboundDto {
  @IsString()
  @IsNotEmpty()
  warehouseId: string;

  @IsString()
  @IsOptional()
  containerNumber?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InboundItemDto)
  items: InboundItemDto[];
}
