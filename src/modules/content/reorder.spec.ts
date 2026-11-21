import {
  reorderLevelActivities,
  reorderUnitLevels,
  reorderUnits,
  validateOrderedIds,
} from './reorder.js';

const ids = (count: number) =>
  Array.from({ length: count }, (_, index) => `id-${index + 1}`);

describe('validateOrderedIds', () => {
  it('acepta el conjunto completo en otro orden', () => {
    expect(validateOrderedIds(['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual({
      ok: true,
    });
  });

  it('rechaza una lista vacía', () => {
    expect(validateOrderedIds([], [])).toEqual({
      ok: false,
      code: 'VALIDATION_FAILED',
      violations: [{ code: 'EMPTY_ORDER' }],
    });
  });

  it('rechaza IDs repetidos, faltantes y desconocidos', () => {
    expect(validateOrderedIds(['a', 'b', 'c'], ['a', 'a', 'x'])).toEqual({
      ok: false,
      code: 'VALIDATION_FAILED',
      violations: [
        { code: 'DUPLICATE_IDS', ids: ['a'] },
        { code: 'MISSING_IDS', ids: ['b', 'c'] },
        { code: 'UNKNOWN_IDS', ids: ['x'] },
      ],
    });
  });

  it('rechaza más de 100 IDs', () => {
    expect(validateOrderedIds(ids(101), ids(101))).toEqual({
      ok: false,
      code: 'VALIDATION_FAILED',
      violations: [{ code: 'TOO_MANY_IDS', count: 101, max: 100 }],
    });
  });
});

describe('reorderUnits', () => {
  const units = [
    { id: 'u1', estructuraFijada: true },
    { id: 'u2', estructuraFijada: true },
    { id: 'u3', estructuraFijada: false },
    { id: 'u4', estructuraFijada: false },
  ];

  it('permite reordenar el tramo no utilizado', () => {
    expect(reorderUnits(units, ['u1', 'u2', 'u4', 'u3'])).toEqual({
      ok: true,
    });
  });

  it('acepta el mismo orden', () => {
    expect(reorderUnits(units, ['u1', 'u2', 'u3', 'u4'])).toEqual({
      ok: true,
    });
  });

  it('rechaza mover una unidad del tramo usado', () => {
    expect(reorderUnits(units, ['u2', 'u1', 'u3', 'u4'])).toEqual({
      ok: false,
      code: 'STRUCTURE_LOCKED',
    });
  });

  it('rechaza introducir una unidad antes del tramo usado', () => {
    expect(reorderUnits(units, ['u3', 'u1', 'u2', 'u4'])).toEqual({
      ok: false,
      code: 'STRUCTURE_LOCKED',
    });
  });

  it('el tramo usado llega hasta la última unidad fijada', () => {
    const mixed = [
      { id: 'u1', estructuraFijada: true },
      { id: 'u2', estructuraFijada: false },
      { id: 'u3', estructuraFijada: true },
      { id: 'u4', estructuraFijada: false },
    ];
    expect(reorderUnits(mixed, ['u1', 'u3', 'u2', 'u4'])).toEqual({
      ok: false,
      code: 'STRUCTURE_LOCKED',
    });
  });

  it('permite cualquier orden si ninguna unidad se usó', () => {
    const unused = units.map((u) => ({ ...u, estructuraFijada: false }));
    expect(reorderUnits(unused, ['u4', 'u3', 'u2', 'u1'])).toEqual({
      ok: true,
    });
  });

  it('rechaza un conjunto incompleto antes de revisar el tramo', () => {
    expect(reorderUnits(units, ['u2', 'u1', 'u3'])).toEqual({
      ok: false,
      code: 'VALIDATION_FAILED',
      violations: [{ code: 'MISSING_IDS', ids: ['u4'] }],
    });
  });

  it('rechaza más de 100 unidades', () => {
    const many = ids(101).map((id) => ({ id, estructuraFijada: false }));
    expect(reorderUnits(many, ids(101))).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
    });
  });

  it('acepta exactamente 100 unidades', () => {
    const many = ids(100).map((id) => ({ id, estructuraFijada: false }));
    expect(reorderUnits(many, ids(100).toReversed())).toEqual({ ok: true });
  });
});

describe('reorderUnitLevels', () => {
  it('reordena los niveles de una unidad no utilizada', () => {
    expect(
      reorderUnitLevels({ estructuraFijada: false }, ['a', 'b'], ['b', 'a']),
    ).toEqual({ ok: true });
  });

  it('rechaza cualquier cambio en una unidad con estructura fijada', () => {
    expect(
      reorderUnitLevels({ estructuraFijada: true }, ['a', 'b'], ['a', 'b']),
    ).toEqual({ ok: false, code: 'STRUCTURE_LOCKED' });
  });

  it('rechaza un conjunto incompleto', () => {
    expect(
      reorderUnitLevels({ estructuraFijada: false }, ['a', 'b'], ['a']),
    ).toEqual({
      ok: false,
      code: 'VALIDATION_FAILED',
      violations: [{ code: 'MISSING_IDS', ids: ['b'] }],
    });
  });
});

describe('reorderLevelActivities', () => {
  it('reordena las actividades del borrador', () => {
    expect(reorderLevelActivities(['a', 'b', 'c'], ['c', 'b', 'a'])).toEqual({
      ok: true,
    });
  });

  it('rechaza duplicados', () => {
    expect(reorderLevelActivities(['a', 'b'], ['a', 'a', 'b'])).toEqual({
      ok: false,
      code: 'VALIDATION_FAILED',
      violations: [{ code: 'DUPLICATE_IDS', ids: ['a'] }],
    });
  });

  it('rechaza una actividad de otro nivel', () => {
    expect(reorderLevelActivities(['a', 'b'], ['a', 'b', 'z'])).toEqual({
      ok: false,
      code: 'VALIDATION_FAILED',
      violations: [{ code: 'UNKNOWN_IDS', ids: ['z'] }],
    });
  });
});
