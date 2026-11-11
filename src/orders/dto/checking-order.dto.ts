// dsh-logistica/src/orders/dto/checking-order.dto.ts

import {
  IsUUID,
  IsArray,
  ValidateNested,
  ArrayMaxSize,
  IsInt,
  Min,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Contrato alineado con frontend/src/types/checking.types.ts (ConfirmCheckingDto).
 */
export class CheckItemDto {
  @IsUUID()
  orderItemId: string;

  @IsInt()
  @Min(0)
  quantityChecked: number;
}

export class ConfirmCheckingDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CheckItemDto)
  itemsChecked: CheckItemDto[];
}
