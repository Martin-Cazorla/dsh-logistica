// src/inventory/dto/create-warehouse.dto.ts

import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateWarehouseDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre del depósito es obligatorio.' })
  name: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  address?: string;
}
