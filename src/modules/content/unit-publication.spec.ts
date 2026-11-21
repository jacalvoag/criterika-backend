import type { Unit, UnitCard, UnitLevel } from './unit.types.js';
import { validateUnitPublication } from './unit-publication.js';

const unit: Pick<Unit, 'id' | 'cartaId'> = { id: 'unit-1', cartaId: 'card-1' };

const level = (
  id: string,
  orden: number,
  overrides: Partial<UnitLevel> = {},
): UnitLevel => ({
  id,
  orden,
  tipo: 'NORMAL',
  estado: 'PUBLICADO',
  ...overrides,
});

const finalLevel = (id: string, orden: number) =>
  level(id, orden, { tipo: 'FINAL_UNIDAD' });

const card: UnitCard = {
  id: 'card-1',
  unidadId: 'unit-1',
  estado: 'PUBLICADO',
};

describe('validateUnitPublication', () => {
  it('acepta niveles publicados con un final al terminar y carta publicada', () => {
    expect(
      validateUnitPublication({
        unit,
        levels: [level('l1', 1), level('l2', 2), finalLevel('l3', 3)],
        card,
      }),
    ).toEqual({ ok: true });
  });

  it('acepta una unidad con un solo nivel, que es el final', () => {
    expect(
      validateUnitPublication({ unit, levels: [finalLevel('l1', 1)], card }),
    ).toEqual({ ok: true });
  });

  it('usa el orden de los niveles y no la posición en la lista', () => {
    expect(
      validateUnitPublication({
        unit,
        levels: [finalLevel('l3', 3), level('l1', 1), level('l2', 2)],
        card,
      }),
    ).toEqual({ ok: true });
  });

  it('rechaza una unidad sin niveles', () => {
    expect(validateUnitPublication({ unit, levels: [], card })).toEqual({
      ok: false,
      violations: [
        { code: 'NO_LEVELS' },
        { code: 'FINAL_LEVEL_COUNT', count: 0 },
      ],
    });
  });

  it('rechaza una unidad sin nivel final', () => {
    expect(
      validateUnitPublication({
        unit,
        levels: [level('l1', 1), level('l2', 2)],
        card,
      }),
    ).toEqual({
      ok: false,
      violations: [{ code: 'FINAL_LEVEL_COUNT', count: 0 }],
    });
  });

  it('rechaza dos niveles finales', () => {
    expect(
      validateUnitPublication({
        unit,
        levels: [level('l1', 1), finalLevel('l2', 2), finalLevel('l3', 3)],
        card,
      }),
    ).toEqual({
      ok: false,
      violations: [{ code: 'FINAL_LEVEL_COUNT', count: 2 }],
    });
  });

  it('rechaza un final que no es el último nivel', () => {
    expect(
      validateUnitPublication({
        unit,
        levels: [level('l1', 1), finalLevel('l2', 2), level('l3', 3)],
        card,
      }),
    ).toEqual({
      ok: false,
      violations: [{ code: 'FINAL_LEVEL_NOT_LAST', levelId: 'l2' }],
    });
  });

  it('rechaza niveles en borrador o deshabilitados', () => {
    expect(
      validateUnitPublication({
        unit,
        levels: [
          level('l1', 1, { estado: 'BORRADOR' }),
          level('l2', 2, { estado: 'DESHABILITADO' }),
          finalLevel('l3', 3),
        ],
        card,
      }),
    ).toEqual({
      ok: false,
      violations: [
        { code: 'LEVEL_NOT_PUBLISHED', levelId: 'l1', estado: 'BORRADOR' },
        { code: 'LEVEL_NOT_PUBLISHED', levelId: 'l2', estado: 'DESHABILITADO' },
      ],
    });
  });

  it('rechaza una unidad sin carta asignada', () => {
    expect(
      validateUnitPublication({
        unit: { id: 'unit-1', cartaId: null },
        levels: [finalLevel('l1', 1)],
        card: null,
      }),
    ).toEqual({ ok: false, violations: [{ code: 'MISSING_CARD' }] });
  });

  it('rechaza cuando la carta indicada no se encontró', () => {
    expect(
      validateUnitPublication({
        unit,
        levels: [finalLevel('l1', 1)],
        card: null,
      }),
    ).toEqual({ ok: false, violations: [{ code: 'MISSING_CARD' }] });
  });

  it('rechaza una carta que no está publicada', () => {
    expect(
      validateUnitPublication({
        unit,
        levels: [finalLevel('l1', 1)],
        card: { ...card, estado: 'BORRADOR' },
      }),
    ).toEqual({
      ok: false,
      violations: [{ code: 'CARD_NOT_PUBLISHED', estado: 'BORRADOR' }],
    });
  });

  it('rechaza una carta de otra unidad o distinta de cartaId', () => {
    expect(
      validateUnitPublication({
        unit,
        levels: [finalLevel('l1', 1)],
        card: { id: 'card-2', unidadId: 'unit-2', estado: 'PUBLICADO' },
      }),
    ).toEqual({ ok: false, violations: [{ code: 'CARD_NOT_OWN' }] });
  });
});
