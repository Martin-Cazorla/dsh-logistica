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
  code: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  taxId?: string;

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
