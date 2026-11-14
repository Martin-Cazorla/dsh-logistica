// dsh-logistica/src/inventory/dto/generate-batch-locations.dto.ts

import {
  IsString,
  IsArray,
  IsNumber,
  IsInt,
  IsEnum,
  IsUUID,
  IsOptional,
  Min,
  Max,
  ArrayNotEmpty,
  ArrayMaxSize,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { toDecimalNumber } from '../../common/decimal-transform';
import {
  MAX_CAPACITY_M3,
  MAX_DIMENSION_M,
} from '../occupancy/location-occupancy';

export enum LocationCategory {
  RACK = 'RACK',
  PASILLO = 'PASILLO',
  TECHO = 'TECHO',
}

const DECIMALS_3 = { maxDecimalPlaces: 3 };

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

  /**
   * Capacidad directa en m³ por posición (acepta "1,25" o 1.25). Opcional si
   * se envían las tres medidas: en ese caso se calcula largo × ancho × alto.
   */
  @IsOptional()
  @Transform(toDecimalNumber)
  @IsNumber(DECIMALS_3, { message: 'La capacidad admite hasta 3 decimales.' })
  @Min(0.001, { message: 'La capacidad debe ser mayor a 0.' })
  @Max(MAX_CAPACITY_M3)
  maxCapacityM3PerUnit?: number;

  @IsOptional()
  @Transform(toDecimalNumber)
  @IsNumber(DECIMALS_3, { message: 'El largo admite hasta 3 decimales.' })
  @Min(0.001, { message: 'El largo debe ser mayor a 0.' })
  @Max(MAX_DIMENSION_M, {
    message: `El largo no puede superar ${MAX_DIMENSION_M} m.`,
  })
  lengthM?: number;

  @IsOptional()
  @Transform(toDecimalNumber)
  @IsNumber(DECIMALS_3, { message: 'El ancho admite hasta 3 decimales.' })
  @Min(0.001, { message: 'El ancho debe ser mayor a 0.' })
  @Max(MAX_DIMENSION_M, {
    message: `El ancho no puede superar ${MAX_DIMENSION_M} m.`,
  })
  widthM?: number;

  @IsOptional()
  @Transform(toDecimalNumber)
  @IsNumber(DECIMALS_3, { message: 'El alto admite hasta 3 decimales.' })
  @Min(0.001, { message: 'El alto debe ser mayor a 0.' })
  @Max(MAX_DIMENSION_M, {
    message: `El alto no puede superar ${MAX_DIMENSION_M} m.`,
  })
  heightM?: number;
}
