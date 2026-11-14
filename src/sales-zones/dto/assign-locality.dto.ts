import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/** Asigna (o mueve) una localidad a una zona comercial. */
export class AssignLocalityDto {
  @IsUUID('all')
  zoneId: string;

  /** Provincia tal como figura en las direcciones (se normaliza). */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  province: string;

  /** Localidad tal como figura en las direcciones (se normaliza). */
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  locality: string;

  /** Nombre para mostrar (opcional). */
  @IsString()
  @IsOptional()
  @MaxLength(150)
  label?: string;
}
