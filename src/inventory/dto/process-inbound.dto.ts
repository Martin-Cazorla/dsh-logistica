// dsh-logistica/src/inventory/dto/process-inbound.dto.ts

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

/**
 * Línea de estibado enviada por la pantalla de "Fase 2" (control físico).
 * Antes el controlador recibía `items: any[]` sin ninguna validación.
 */
export class ProcessInboundItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  sku: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  description: string;

  @IsInt()
  @Min(1)
  quantityBultos: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  unitsPerBox?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weightPerBultoKg?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  volumePerBultoM3?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sampleUnits?: number;

  @IsOptional()
  @IsString()
  entryDate?: string;

  @IsUUID()
  locationId: string;

  /** Ignorado: el depósito se deriva de la ubicación. */
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  parentSku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ProcessInboundDto {
  @IsUUID()
  containerId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => ProcessInboundItemDto)
  items: ProcessInboundItemDto[];
}
