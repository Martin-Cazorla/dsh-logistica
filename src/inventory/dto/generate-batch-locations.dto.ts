import {
  IsString,
  IsArray,
  IsNumber,
  IsEnum,
  Min,
  ArrayNotEmpty,
} from 'class-validator';

export enum LocationCategory {
  RACK = 'RACK',
  PASILLO = 'PASILLO',
  TECHO = 'TECHO',
}

export class GenerateBatchLocationsDto {
  @IsString()
  warehouseId: string;

  @IsEnum(LocationCategory)
  category: LocationCategory;

  @IsString()
  areaName: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  levels: string[];

  @IsNumber()
  @Min(1)
  positionStart: number;

  @IsNumber()
  @Min(1)
  positionEnd: number;

  @IsNumber()
  @Min(0)
  maxCapacityM3PerUnit: number;
}
