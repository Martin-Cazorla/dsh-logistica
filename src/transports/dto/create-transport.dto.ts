import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTransportDto {
  @IsString()
  @IsNotEmpty()
  name: string; // Nombre de la empresa de transporte

  @IsString()
  @IsNotEmpty()
  address: string; // Dirección física o depósito del transporte

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  businessHours?: string; // Días y horarios de recepción/atención
}
