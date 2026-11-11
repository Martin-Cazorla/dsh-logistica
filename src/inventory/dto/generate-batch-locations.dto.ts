// dsh-logistica/src/inventory/dto/generate-batch-locations.dto.ts

import {
  IsString,
  IsArray,
  IsNumber,
  IsInt,
  IsEnum,
  IsUUID,
  Min,
  Max,
  ArrayNotEmpty,
  ArrayMaxSize,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export enum LocationCategory {
  RACK = 'RACK',
  PASILLO = 'PASILLO',
  TECHO = 'TECHO',
}

export class GenerateBatchLocationsDto {
  @IsUUID()
  warehouseId: string;

  @IsEnum(LocationCategory)
  category: LocationCategory;

  @IsString()
  @MaxLength(20)
  areaName: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(26)
  @IsString({ each: true })
  @MaxLength(10, { each: true })
  levels: string[];

  @IsInt()
  @Min(1)
  @Max(9999)
  positionStart: number;

  @IsInt()
  @Min(1)
  @Max(9999)
  positionEnd: number;

  /** Acepta "2,5" o 2.5 (el frontend envía string o number). */
  @Transform(({ value }) =>
    typeof value === 'string' ? parseFloat(value.replace(',', '.')) : value,
  )
  @IsNumber()
  @Min(0)
  maxCapacityM3PerUnit: number;
}
