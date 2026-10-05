import {
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ArrayMinSize,
} from 'class-validator';

export class CreateRouteDto {
  @IsString()
  @IsNotEmpty()
  code: string; // Ej: "RUTA-ZONA-NORTE-2026-01"

  @IsUUID()
  @IsNotEmpty()
  driverId: string; // ID del usuario con rol DRIVER

  @IsString()
  @IsOptional()
  vehicleInfo?: string; // Ej: "Mercedes Benz Sprinter - AA123CD"

  @IsDateString()
  @IsNotEmpty()
  scheduledDate: string; // Fecha programada para el despacho

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  orderIds: string[]; // Lista de IDs de pedidos en estado CHECKED a consolidar
}
