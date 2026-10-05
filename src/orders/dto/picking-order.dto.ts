import {
  IsNotEmpty,
  IsUUID,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PickItemDto {
  @IsUUID()
  @IsNotEmpty()
  productId: string;

  @IsUUID()
  @IsNotEmpty()
  locationId: string; // Ubicación exacta desde donde se toma el producto

  @IsInt()
  @Min(1)
  bultos: number; // Cantidad de bultos efectivamente tomados de esa posición
}

export class ProcessPickingDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PickItemDto)
  pickedItems: PickItemDto[];
}
