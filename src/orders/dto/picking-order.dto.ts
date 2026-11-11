// dsh-logistica/src/orders/dto/picking-order.dto.ts

import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsUUID,
  Min,
} from 'class-validator';

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
 * registra un faltante (SHORT) y libera el resto de la reserva.
 */
export class ConfirmPickTaskDto {
  @IsInt()
  @Min(0)
  quantity: number;
}
