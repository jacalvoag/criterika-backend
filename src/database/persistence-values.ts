export class PersistenceInvariantError extends Error {
  constructor(message = 'Estado de persistencia inconsistente.') {
    super(message);
    this.name = 'PersistenceInvariantError';
  }
}

export function safeInteger(value: string | number): number {
  if (typeof value === 'string' && !/^-?\d+$/.test(value)) {
    throw new PersistenceInvariantError('Valor numérico no válido.');
  }
  const result = Number(value);
  if (!Number.isSafeInteger(result)) {
    throw new PersistenceInvariantError('Valor fuera del rango entero seguro.');
  }
  return result;
}

export function requireOne(rowCount: number | null): void {
  if (rowCount !== 1) throw new PersistenceInvariantError();
}

export type JsonValue =
  null | boolean | number | string | JsonValue[] | JsonObject;
export interface JsonObject {
  [key: string]: JsonValue;
}

/** Reject non-JSON values rather than silently dropping undefined or rounding NaN. */
export function canonicalJson(value: unknown): string {
  const ancestors = new Set<object>();
  const encode = (item: unknown): string => {
    if (
      item === null ||
      typeof item === 'string' ||
      typeof item === 'boolean'
    ) {
      return JSON.stringify(item);
    }
    if (typeof item === 'number' && Number.isFinite(item))
      return JSON.stringify(item);
    if (typeof item !== 'object' || item === null || ancestors.has(item)) {
      throw new PersistenceInvariantError('Se requiere un valor JSON válido.');
    }
    ancestors.add(item);
    try {
      if (Array.isArray(item))
        return '[' + Array.from(item, encode).join(',') + ']';
      if (
        Object.getPrototypeOf(item) !== Object.prototype &&
        Object.getPrototypeOf(item) !== null
      ) {
        throw new PersistenceInvariantError(
          'Se requiere un objeto JSON simple.',
        );
      }
      const record = item as Record<string, unknown>;
      return (
        '{' +
        Object.keys(record)
          .sort()
          .map((key) => JSON.stringify(key) + ':' + encode(record[key]))
          .join(',') +
        '}'
      );
    } finally {
      ancestors.delete(item);
    }
  };
  return encode(value);
}

export function jsonObject(value: unknown): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new PersistenceInvariantError('Se requiere un objeto JSON.');
  }
  return canonicalJson(value);
}
