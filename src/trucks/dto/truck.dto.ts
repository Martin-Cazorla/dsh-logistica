// dsh-logistica/src/trucks/dto/truck.dto.ts

import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Patentes argentinas: AAA123 (Mercosur viejo) o AA123AA (Mercosur). */
const PLATE_REGEX = /^([A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2})$/;

const normalizePlate = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/[\s-]/g, '').toUpperCase() : value;

export class CreateTruckDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  brand: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  model: string;

  @Transform(normalizePlate)
  @IsString()
  @Matches(PLATE_REGEX, {
    message: 'La patente debe tener formato AAA123 o AA123AA.',
  })
  plate: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.1)
  capacityM3: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  maxLoadKg: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  notes?: string;
}

export class UpdateTruckDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  brand?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  model?: string;

  @IsOptional()
  @Transform(normalizePlate)
  @IsString()
  @Matches(PLATE_REGEX, {
    message: 'La patente debe tener formato AAA123 o AA123AA.',
  })
  plate?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.1)
  capacityM3?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  maxLoadKg?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
