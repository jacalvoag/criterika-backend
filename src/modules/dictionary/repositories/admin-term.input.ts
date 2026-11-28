import { PersistenceInvariantError } from '../../../database/persistence-values.js';
export interface TermDraft {
  nombre: string;
  categoria: string;
  definicion: string;
  ejemplo: string;
  fuenteUrl?: string | null;
}
export function termInput(
  value: TermDraft | Partial<TermDraft>,
  partial = false,
): Partial<TermDraft> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !Object.keys(value).length ||
    Object.keys(value).some(
      (k) =>
        !['nombre', 'categoria', 'definicion', 'ejemplo', 'fuenteUrl'].includes(
          k,
        ),
    )
  )
    throw new PersistenceInvariantError('Término inválido.');
  for (const key of ['nombre', 'categoria', 'definicion', 'ejemplo'] as const) {
    const text = value[key];
    if (text === undefined && partial && !Object.hasOwn(value, key)) continue;
    if (
      typeof text !== 'string' ||
      text.includes('\0') ||
      Array.from(text).length < 1 ||
      Array.from(text).length >
        (['nombre', 'categoria'].includes(key) ? 120 : 2000)
    )
      throw new PersistenceInvariantError('Texto de término inválido.');
  }
  if (Object.hasOwn(value, 'fuenteUrl')) {
    if (value.fuenteUrl !== null) {
      if (typeof value.fuenteUrl !== 'string' || value.fuenteUrl.includes('\0'))
        throw new PersistenceInvariantError('Referencia de término inválida.');
      try {
        new URL(value.fuenteUrl);
      } catch {
        throw new PersistenceInvariantError('Referencia de término inválida.');
      }
    }
  }
  return { ...value };
}
export function termVersion(version: bigint) {
  if (
    typeof version !== 'bigint' ||
    version < 1n ||
    version >= 9223372036854775807n
  )
    throw new PersistenceInvariantError('Versión de término inválida.');
}
