// dsh-logistica/src/common/decimal-transform.ts

/**
 * Transformación para class-transformer: acepta números o strings con coma o
 * punto decimal ("1,5" / "1.5") y los convierte a number. Strings vacíos se
 * convierten en undefined (campo omitido). Valores no numéricos se devuelven
 * tal cual para que @IsNumber los rechace con un mensaje claro.
 */
export function toDecimalNumber({ value }: { value: unknown }): unknown {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const normalized = trimmed.replace(/\s/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return value;
  return Number(normalized);
}
