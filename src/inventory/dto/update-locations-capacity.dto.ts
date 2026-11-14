// dsh-logistica/src/inventory/dto/update-locations-capacity.dto.ts

import {
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
  IsUUID,
  IsNumber,
  IsOptional,
  Min,
  Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { toDecimalNumber } from '../../common/decimal-transform';
import {
  MAX_CAPACITY_M3,
  MAX_DIMENSION_M,
} from '../occupancy/location-occupancy';

const DECIMALS_3 = { maxDecimalPlaces: 3 };

/**
 * Edición de capacidad de una ubicación: se envían las tres medidas (la
 * capacidad se calcula) o la capacidad directa en m³. Acepta coma o punto.
 */
export class LocationCapacityUpdateDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @Transform(toDecimalNumber)
  @IsNumber(DECIMALS_3, { message: 'La capacidad admite hasta 3 decimales.' })
  @Min(0.001, { message: 'La capacidad debe ser mayor a 0.' })
  @Max(MAX_CAPACITY_M3)
  capacity?: number;

  @IsOptional()
  @Transform(toDecimalNumber)
  @IsNumber(DECIMALS_3, { message: 'El largo admite hasta 3 decimales.' })
  @Min(0.001, { message: 'El largo debe ser mayor a 0.' })
  @Max(MAX_DIMENSION_M)
  lengthM?: number;

  @IsOptional()
  @Transform(toDecimalNumber)
  @IsNumber(DECIMALS_3, { message: 'El ancho admite hasta 3 decimales.' })
  @Min(0.001, { message: 'El ancho debe ser mayor a 0.' })
  @Max(MAX_DIMENSION_M)
  widthM?: number;

  @IsOptional()
  @Transform(toDecimalNumber)
  @IsNumber(DECIMALS_3, { message: 'El alto admite hasta 3 decimales.' })
  @Min(0.001, { message: 'El alto debe ser mayor a 0.' })
  @Max(MAX_DIMENSION_M)
  heightM?: number;
}

export class UpdateLocationsCapacityDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => LocationCapacityUpdateDto)
  updates: LocationCapacityUpdateDto[];
}

export class DeleteLocationsBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @IsUUID('all', { each: true })
  locationIds: string[];
}
