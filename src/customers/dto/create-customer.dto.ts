import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsEnum,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsUUID,
  ValidateNested,
  ArrayMinSize,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TaxCondition, CustomerType } from '@prisma/client';
import { CreateCustomerAddressDto } from './create-customer-address.dto';

export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  customerNumber: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{2}-\d{8}-\d{1}$/, {
    message: 'El CUIT debe tener el formato XX-XXXXXXXX-X',
  })
  cuit: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  legalName: string;

  @IsEmail({}, { message: 'El formato del email corporativo es inválido' })
  @IsNotEmpty()
  @MaxLength(255)
  email: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  phone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  contactPerson?: string;

  @IsEnum(CustomerType)
  @IsOptional()
  type?: CustomerType;

  @IsEnum(TaxCondition)
  @IsOptional()
  taxCondition?: TaxCondition;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  logisticsFee?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsUUID('4')
  @IsOptional()
  transportId?: string;

  @ValidateNested({ each: true })
  @Type(() => CreateCustomerAddressDto)
  @ArrayMinSize(1, { message: 'Debe ingresar al menos una dirección' })
  addresses: CreateCustomerAddressDto[];
}
