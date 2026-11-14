import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsOptional,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateCustomerAddressDto {
  /**
   * Sólo en edición: identifica una dirección existente del cliente.
   * Sin id → se crea una dirección nueva.
   */
  @IsUUID('all', { message: 'El id de la dirección debe ser un UUID válido' })
  @IsOptional()
  id?: string;

  /** Nombre o alias del local (ej. "Sucursal Centro"). */
  @IsString()
  @IsOptional()
  @MaxLength(100)
  alias?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  address: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  province: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  zipCode: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  businessHours?: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
