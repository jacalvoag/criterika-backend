import { PersistenceInvariantError } from '../../../database/persistence-values.js';
import type { LegalDraftInput } from './legal-document.types.js';

function text(value: unknown, min: number, max: number): value is string {
  if (typeof value !== 'string' || value.includes('\0')) return false;
  const length = Array.from(value).length;
  return length >= min && length <= max;
}
function keys(value: object, allowed: string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}
/** SQL input guard, not a replacement for Uzzi's DTO and semantic legal review. */
export function legalDraft(input: LegalDraftInput): LegalDraftInput {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    !keys(input, [
      'tipo',
      'version',
      'contenidoMarkdown',
      'tipoCambio',
      'finalidades',
    ]) ||
    !['TERMINOS', 'AVISO_PRIVACIDAD'].includes(input.tipo) ||
    !['EDITORIAL', 'CONTRACTUAL', 'NUEVA_FINALIDAD'].includes(
      input.tipoCambio,
    ) ||
    !text(input.version, 1, 40) ||
    !text(input.contenidoMarkdown, 50, 100000) ||
    !Array.isArray(input.finalidades) ||
    input.finalidades.length > 30 ||
    (input.tipo === 'TERMINOS' && input.finalidades.length > 0) ||
    input.finalidades.some(
      (p) =>
        !p ||
        typeof p !== 'object' ||
        Array.isArray(p) ||
        !keys(p, ['id', 'descripcion', 'necesaria']) ||
        typeof p.id !== 'string' ||
        !/^[a-z][a-z0-9_]{2,63}(?![\s\S])/.test(p.id) ||
        !text(p.descripcion, 1, 2000) ||
        p.necesaria !== true,
    ) ||
    new Set(input.finalidades.map((p) => p.id)).size !==
      input.finalidades.length
  )
    throw new PersistenceInvariantError('Borrador legal inválido.');
  return { ...input, finalidades: input.finalidades.map((p) => ({ ...p })) };
}
export function legalVersion(version: bigint): void {
  if (
    typeof version !== 'bigint' ||
    version < 1n ||
    version >= 9223372036854775807n
  )
    throw new PersistenceInvariantError('Versión legal inválida o agotada.');
}
