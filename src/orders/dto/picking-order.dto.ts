// dsh-logistica/src/orders/dto/picking-order.dto.ts

import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { PickShortReason } from '@prisma/client';

/** Asignación de uno o varios pickers a un pedido (reemplaza el conjunto). */
export class AssignPickersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  pickerIds: string[];
}

/**
 * Confirmación de UNA línea del recorrido. `quantity` < cantidad planificada
 * registra un faltante (SHORT): el motivo es obligatorio y con OTHER también
 * la observación (validado en PickingService).
 */
export class ConfirmPickTaskDto {
  @IsInt()
  @Min(0)
  quantity: number;

  @IsOptional()
  @IsEnum(PickShortReason)
  shortReason?: PickShortReason;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;
}
