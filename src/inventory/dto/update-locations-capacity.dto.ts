// dsh-logistica/src/inventory/dto/update-locations-capacity.dto.ts

import {
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
  IsUUID,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class LocationCapacityUpdateDto {
  @IsUUID()
  id: string;

  @IsNumber()
  @Min(0)
  capacity: number;
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
