import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsEmail,
} from 'class-validator';

export enum DeliveryZone {
  CABA = 'CABA',
  ZONA_NORTE = 'ZONA_NORTE',
  ZONA_SUR = 'ZONA_SUR',
  ZONA_OESTE = 'ZONA_OESTE',
  INTERIOR = 'INTERIOR',
}

export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  taxId: string; // CUIT / CUIL

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsEnum(DeliveryZone)
  @IsNotEmpty()
  zone: DeliveryZone;
}
