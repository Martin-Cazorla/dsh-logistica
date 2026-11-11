// dsh-logistica/src/routes/dto/create-route.dto.ts

import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RouteStatus } from '@prisma/client';

export class CreateRouteDto {
  /** Si se omite se genera HR-AAAAMMDD-XXXX. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code?: string;

  @IsUUID()
  truckId: string;

  @IsUUID()
  driverId: string; // Usuario con rol DRIVER

  @IsOptional()
  @IsUUID()
  helperId?: string; // Usuario con rol HELPER (peón / cadete)

  @IsDateString()
  scheduledDate: string;

  /** Orden inicial de entrega (el chofer puede reordenarlo luego). */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(80)
  @IsUUID('all', { each: true })
  orderIds: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

/** Nueva secuencia de las paradas aún no finalizadas. */
export class ReorderStopsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(80)
  @IsUUID('all', { each: true })
  stopIds: string[];
}

/** Punto de Control 2a: carga del camión. */
export class LoadCheckDto {
  @IsInt()
  @Min(0)
  loadedBultos: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

/** Punto de Control 2b: descarga en el domicilio del cliente. */
export class DeliveryCheckDto {
  @IsOptional()
  @IsBoolean()
  failed?: boolean;

  @ValidateIf((o: DeliveryCheckDto) => !o.failed)
  @IsInt()
  @Min(0)
  deliveredBultos?: number;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  recipientName?: string;

  /** Obligatorio si la entrega es parcial o fallida. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ListRoutesQueryDto {
  @IsOptional()
  @IsEnum(RouteStatus)
  status?: RouteStatus;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class CancelRouteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reason: string;
}
