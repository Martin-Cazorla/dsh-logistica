import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { OrderStatus } from '@prisma/client';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_OR_NONE =
  /^(none|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** Filtros comunes del análisis (se mantienen al navegar entre niveles). */
export class AnalyticsFiltersDto {
  /** Desde (YYYY-MM-DD, hora de Argentina). Por defecto: hasta − 89 días. */
  @IsOptional()
  @Matches(DATE, { message: 'from debe tener formato YYYY-MM-DD' })
  from?: string;

  /** Hasta inclusive (YYYY-MM-DD). Por defecto: hoy. */
  @IsOptional()
  @Matches(DATE, { message: 'to debe tener formato YYYY-MM-DD' })
  to?: string;

  @IsOptional()
  @IsUUID('all', { message: 'warehouseId inválido' })
  warehouseId?: string;

  /** UUID del vendedor o "none" para pedidos sin vendedor asignado. */
  @IsOptional()
  @Matches(UUID_OR_NONE, { message: 'sellerId inválido' })
  sellerId?: string;

  /** Estados separados por coma. Por defecto: todos menos CANCELLED. */
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.split(',').map((s) => s.trim()).filter(Boolean)
      : value,
  )
  @IsEnum(OrderStatus, { each: true, message: 'Estado de pedido inválido' })
  statuses?: OrderStatus[];
}

export class SalesByZoneQueryDto extends AnalyticsFiltersDto {
  /** Clave normalizada de provincia (nivel 2 / 3). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  province?: string;

  /** Zona elegida (nivel 3): UUID o "none" para "Sin zona asignada". */
  @IsOptional()
  @Matches(UUID_OR_NONE, { message: 'zoneId inválido' })
  zoneId?: string;
}

export class TopZonesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}
