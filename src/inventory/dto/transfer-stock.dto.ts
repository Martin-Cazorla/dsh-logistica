import { IsString, IsNotEmpty, IsInt, Min, IsOptional } from 'class-validator';

export class TransferStockDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsString()
  @IsNotEmpty()
  originWarehouseId: string;

  @IsString()
  @IsNotEmpty()
  originLocationId: string;

  @IsString()
  @IsNotEmpty()
  destinationWarehouseId: string;

  @IsString()
  @IsNotEmpty()
  destinationLocationId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsNotEmpty()
  userId: string;
}
