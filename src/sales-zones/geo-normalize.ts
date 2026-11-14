// dsh-logistica/src/sales-zones/geo-normalize.ts

import { Prisma } from '@prisma/client';

/**
 * Normalización de provincia / localidad para comparar direcciones con las
 * zonas comerciales. Existe en dos versiones que DEBEN dar el mismo
 * resultado:
 *  - normalizeGeo() en TS (asignación de zona al guardar, seed, backfill);
 *  - normalizeGeoSql() en SQL (agregaciones y reasignaciones en la base).
 * Ambas usan las mismas tablas de alias definidas abajo.
 */

/** Clave canónica de la Ciudad Autónoma de Buenos Aires. */
export const CABA_KEY = 'caba';
/** Clave canónica de la provincia de Buenos Aires. */
export const BUENOS_AIRES_KEY = 'buenos aires';

/** Formas habituales de escribir CABA (ya normalizadas). */
export const CABA_ALIASES = [
  'caba',
  'c.a.b.a.',
  'c.a.b.a',
  'capital federal',
  'cap. federal',
  'cap federal',
  'capital',
  'ciudad autonoma de buenos aires',
  'ciudad autonoma buenos aires',
  'cdad. autonoma de buenos aires',
  'cdad autonoma de buenos aires',
  'ciudad de buenos aires',
];

/** Formas habituales de escribir la provincia de Buenos Aires. */
export const BUENOS_AIRES_ALIASES = [
  'buenos aires',
  'provincia de buenos aires',
  'pcia. de buenos aires',
  'pcia de buenos aires',
  'pcia. buenos aires',
  'prov. de buenos aires',
  'prov. buenos aires',
  'bs as',
  'bs. as.',
  'bs.as.',
  'bsas',
  'pba',
];

const CABA_SET = new Set(CABA_ALIASES);
const BA_SET = new Set(BUENOS_AIRES_ALIASES);

/** Minúsculas, sin acentos (ñ → n) y sin espacios dobles. */
export function normalizeGeo(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function isCaba(value: string | null | undefined): boolean {
  return CABA_SET.has(normalizeGeo(value));
}

/**
 * Clave de provincia de una dirección. Si la provincia O la localidad son un
 * alias de CABA (ej. provincia "Buenos Aires", ciudad "Capital Federal"), la
 * dirección es de CABA.
 */
export function provinceKey(province: string, city?: string | null): string {
  const p = normalizeGeo(province);
  if (CABA_SET.has(p) || isCaba(city)) return CABA_KEY;
  if (BA_SET.has(p)) return BUENOS_AIRES_KEY;
  return p;
}

/** Clave de localidad (los alias de CABA colapsan en "caba"). */
export function localityKey(city: string): string {
  const c = normalizeGeo(city);
  return CABA_SET.has(c) ? CABA_KEY : c;
}

/**
 * Clave (provincia, localidad) con la que se busca la zona. En CABA toda la
 * ciudad es una única zona, sin importar el barrio cargado como localidad.
 */
export function zoneLookupKey(
  province: string,
  city: string,
): { province: string; locality: string } {
  const p = provinceKey(province, city);
  return { province: p, locality: p === CABA_KEY ? CABA_KEY : localityKey(city) };
}

// ---------------------------------------------------------------------------
// Equivalentes SQL (PostgreSQL)
// ---------------------------------------------------------------------------

// translate() con mayúsculas y minúsculas acentuadas: no dependemos de que
// lower() de la base maneje caracteres no ASCII según el locale.
const ACCENTS_FROM =
  'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ';
const ACCENTS_TO =
  'aaaaaeeeeiiiiooooouuuuncaaaaaeeeeiiiiooooouuuunc';

/** SQL equivalente a normalizeGeo() sobre una expresión/columna. */
export function normalizeGeoSql(expr: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`btrim(regexp_replace(translate(lower(${expr}), ${ACCENTS_FROM}, ${ACCENTS_TO}), '\\s+', ' ', 'g'))`;
}

/** SQL equivalente a provinceKey(province, city). */
export function provinceKeySql(
  province: Prisma.Sql,
  city: Prisma.Sql,
): Prisma.Sql {
  const p = normalizeGeoSql(province);
  const c = normalizeGeoSql(city);
  return Prisma.sql`(CASE
    WHEN ${p} = ANY(${CABA_ALIASES}::text[]) OR ${c} = ANY(${CABA_ALIASES}::text[]) THEN ${CABA_KEY}
    WHEN ${p} = ANY(${BUENOS_AIRES_ALIASES}::text[]) THEN ${BUENOS_AIRES_KEY}
    ELSE ${p} END)`;
}

/** SQL equivalente a localityKey(city). */
export function localityKeySql(city: Prisma.Sql): Prisma.Sql {
  const c = normalizeGeoSql(city);
  return Prisma.sql`(CASE WHEN ${c} = ANY(${CABA_ALIASES}::text[]) THEN ${CABA_KEY} ELSE ${c} END)`;
}

/** SQL equivalente a zoneLookupKey(): devuelve [province, locality]. */
export function zoneLookupKeySql(
  province: Prisma.Sql,
  city: Prisma.Sql,
): { province: Prisma.Sql; locality: Prisma.Sql } {
  const p = provinceKeySql(province, city);
  return {
    province: p,
    locality: Prisma.sql`(CASE WHEN ${p} = ${CABA_KEY} THEN ${CABA_KEY} ELSE ${localityKeySql(city)} END)`,
  };
}
