import {
  canonicalJson,
  jsonObject,
  safeInteger,
} from './persistence-values.js';

describe('Conversión de persistencia', () => {
  it('preserva enteros seguros sin redondear bigint', () => {
    expect(safeInteger('9007199254740991')).toBe(Number.MAX_SAFE_INTEGER);
    expect(safeInteger('150')).toBe(150);
    expect(() => safeInteger('9007199254740992')).toThrow();
    expect(() => safeInteger('9007199254740993')).toThrow();
    expect(() => safeInteger('1.5')).toThrow();
    expect(() => safeInteger('')).toThrow();
  });

  it('normaliza claves de objetos conservando el orden de arrays', () => {
    expect(canonicalJson({ b: 2, a: { d: 4, c: 3 } })).toBe(
      canonicalJson({ a: { c: 3, d: 4 }, b: 2 }),
    );
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it.each([undefined, NaN, Infinity, new Date(), { a: undefined }, 1n])(
    'rechaza JSON que perdería información: %s',
    (value) => {
      expect(() => canonicalJson(value)).toThrow();
    },
  );

  it('rechaza ciclos y objetos raíz incompatibles con JSONB de juego', () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() => canonicalJson(cycle)).toThrow();
    expect(() => jsonObject([])).toThrow();
    expect(() => jsonObject(null)).toThrow();
    const sparse: unknown[] = [];
    sparse.length = 2;
    expect(() => canonicalJson(sparse)).toThrow();
  });
});
