import type { PathLevelInput, PathUnitInput } from './learning-path.types.js';
import { buildLearningPath } from './learning-path.js';

const level = (
  id: string,
  orden: number,
  overrides: Partial<PathLevelInput> = {},
): PathLevelInput => ({
  id,
  nombre: `Nivel ${id}`,
  orden,
  tipo: 'NORMAL',
  estado: 'PUBLICADO',
  completado: false,
  ...overrides,
});

const unit = (
  id: string,
  orden: number,
  niveles: PathLevelInput[],
  overrides: Partial<PathUnitInput> = {},
): PathUnitInput => ({
  id,
  nombre: `Unidad ${id}`,
  descripcion: 'Descripción',
  orden,
  estado: 'PUBLICADO',
  estadoCarta: 'PUBLICADO',
  niveles,
  ...overrides,
});

const reasons = (result: ReturnType<typeof buildLearningPath>) => {
  if (!result.ok) throw new Error('expected ok');
  return result.items.map(({ id, niveles }) => ({
    id,
    niveles: niveles.map(({ id: levelId, disponible, motivoNoDisponible }) => ({
      id: levelId,
      disponible,
      motivoNoDisponible,
    })),
  }));
};

describe('buildLearningPath', () => {
  it('ofrece solo el primer nivel a un jugador nuevo', () => {
    const result = buildLearningPath([
      unit('u1', 1, [level('a', 1), level('b', 2, { tipo: 'FINAL_UNIDAD' })]),
    ]);
    expect(reasons(result)).toEqual([
      {
        id: 'u1',
        niveles: [
          { id: 'a', disponible: true, motivoNoDisponible: null },
          { id: 'b', disponible: false, motivoNoDisponible: 'PRERREQUISITO' },
        ],
      },
    ]);
  });

  it('devuelve el resumen completo de la unidad', () => {
    const result = buildLearningPath([
      unit('u1', 1, [
        level('a', 1, { completado: true }),
        level('b', 2, { tipo: 'FINAL_UNIDAD' }),
      ]),
    ]);
    expect(result).toEqual({
      ok: true,
      items: [
        {
          id: 'u1',
          nombre: 'Unidad u1',
          descripcion: 'Descripción',
          orden: 1,
          completada: false,
          nivelesCompletados: 1,
          niveles: [
            {
              id: 'a',
              nombre: 'Nivel a',
              orden: 1,
              tipo: 'NORMAL',
              completado: true,
              disponible: true,
              motivoNoDisponible: null,
            },
            {
              id: 'b',
              nombre: 'Nivel b',
              orden: 2,
              tipo: 'FINAL_UNIDAD',
              completado: false,
              disponible: true,
              motivoNoDisponible: null,
            },
          ],
        },
      ],
    });
  });

  it('ordena unidades y niveles por orden', () => {
    const result = buildLearningPath([
      unit('u2', 2, [level('c', 1)]),
      unit('u1', 1, [level('b', 2), level('a', 1, { completado: true })]),
    ]);
    expect(reasons(result)).toEqual([
      {
        id: 'u1',
        niveles: [
          { id: 'a', disponible: true, motivoNoDisponible: null },
          { id: 'b', disponible: true, motivoNoDisponible: null },
        ],
      },
      {
        id: 'u2',
        niveles: [
          { id: 'c', disponible: false, motivoNoDisponible: 'PRERREQUISITO' },
        ],
      },
    ]);
  });

  it('pide terminar la unidad anterior antes de la siguiente', () => {
    const result = buildLearningPath([
      unit('u1', 1, [level('a', 1, { completado: true })]),
      unit('u2', 2, [level('b', 1)]),
    ]);
    expect(reasons(result)[1]?.niveles[0]).toEqual({
      id: 'b',
      disponible: true,
      motivoNoDisponible: null,
    });
  });

  it('no omite un prerrequisito deshabilitado sin completar', () => {
    const result = buildLearningPath([
      unit('u1', 1, [
        level('a', 1, { completado: true }),
        level('b', 2, { estado: 'DESHABILITADO' }),
        level('c', 3),
      ]),
    ]);
    expect(reasons(result)[0]?.niveles).toEqual([
      { id: 'a', disponible: true, motivoNoDisponible: null },
      { id: 'b', disponible: false, motivoNoDisponible: 'DESHABILITADO' },
      { id: 'c', disponible: false, motivoNoDisponible: 'PRERREQUISITO' },
    ]);
  });

  it('conserva el progreso de un nivel deshabilitado ya completado', () => {
    const result = buildLearningPath([
      unit('u1', 1, [
        level('a', 1, { completado: true, estado: 'DESHABILITADO' }),
        level('b', 2),
      ]),
    ]);
    if (!result.ok) throw new Error('expected ok');
    const [a, b] = result.items[0]?.niveles ?? [];
    expect(a).toMatchObject({
      completado: true,
      disponible: false,
      motivoNoDisponible: 'DESHABILITADO',
    });
    expect(b).toMatchObject({ disponible: true, motivoNoDisponible: null });
    expect(result.items[0]?.nivelesCompletados).toBe(1);
  });

  it('marca todos los niveles de una unidad deshabilitada y bloquea la siguiente', () => {
    const result = buildLearningPath([
      unit('u1', 1, [level('a', 1), level('b', 2)], {
        estado: 'DESHABILITADO',
      }),
      unit('u2', 2, [level('c', 1)]),
    ]);
    expect(reasons(result)).toEqual([
      {
        id: 'u1',
        niveles: [
          {
            id: 'a',
            disponible: false,
            motivoNoDisponible: 'UNIDAD_DESHABILITADA',
          },
          {
            id: 'b',
            disponible: false,
            motivoNoDisponible: 'UNIDAD_DESHABILITADA',
          },
        ],
      },
      {
        id: 'u2',
        niveles: [
          { id: 'c', disponible: false, motivoNoDisponible: 'PRERREQUISITO' },
        ],
      },
    ]);
  });

  it('conserva unidad completada aunque esté deshabilitada', () => {
    const result = buildLearningPath([
      unit('u1', 1, [level('a', 1, { completado: true })], {
        estado: 'DESHABILITADO',
      }),
      unit('u2', 2, [level('b', 1)]),
    ]);
    if (!result.ok) throw new Error('expected ok');
    expect(result.items[0]).toMatchObject({
      completada: true,
      nivelesCompletados: 1,
    });
    expect(result.items[1]?.niveles[0]).toMatchObject({ disponible: true });
  });

  it('bloquea el final sin carta publicada', () => {
    const final = level('b', 2, { tipo: 'FINAL_UNIDAD' });
    const disabledCard = buildLearningPath([
      unit('u1', 1, [level('a', 1, { completado: true }), final], {
        estadoCarta: 'DESHABILITADO',
      }),
    ]);
    const noCard = buildLearningPath([
      unit('u1', 1, [level('a', 1, { completado: true }), final], {
        estadoCarta: null,
      }),
    ]);
    for (const result of [disabledCard, noCard]) {
      expect(reasons(result)[0]?.niveles[1]).toEqual({
        id: 'b',
        disponible: false,
        motivoNoDisponible: 'CARTA_NO_DISPONIBLE',
      });
    }
  });

  it('la carta no disponible no bloquea niveles normales', () => {
    const result = buildLearningPath([
      unit('u1', 1, [level('a', 1)], { estadoCarta: 'DESHABILITADO' }),
    ]);
    expect(reasons(result)[0]?.niveles[0]?.disponible).toBe(true);
  });

  it('prioriza unidad deshabilitada, luego nivel, prerrequisito y carta', () => {
    const final = (overrides: Partial<PathLevelInput> = {}) =>
      level('f', 2, { tipo: 'FINAL_UNIDAD', ...overrides });
    const reasonOf = (input: PathUnitInput) =>
      reasons(buildLearningPath([input]))[0]?.niveles[1]?.motivoNoDisponible;

    expect(
      reasonOf(
        unit('u1', 1, [level('a', 1), final({ estado: 'DESHABILITADO' })], {
          estado: 'DESHABILITADO',
          estadoCarta: null,
        }),
      ),
    ).toBe('UNIDAD_DESHABILITADA');
    expect(
      reasonOf(
        unit('u1', 1, [level('a', 1), final({ estado: 'DESHABILITADO' })], {
          estadoCarta: null,
        }),
      ),
    ).toBe('DESHABILITADO');
    expect(
      reasonOf(unit('u1', 1, [level('a', 1), final()], { estadoCarta: null })),
    ).toBe('PRERREQUISITO');
  });

  it('excluye unidades y niveles en borrador', () => {
    const result = buildLearningPath([
      unit('u1', 1, [
        level('a', 1, { completado: true }),
        level('draft', 2, { estado: 'BORRADOR' }),
        level('b', 3),
      ]),
      unit('u2', 2, [level('c', 1)], { estado: 'BORRADOR' }),
    ]);
    expect(reasons(result)).toEqual([
      {
        id: 'u1',
        niveles: [
          { id: 'a', disponible: true, motivoNoDisponible: null },
          { id: 'b', disponible: true, motivoNoDisponible: null },
        ],
      },
    ]);
  });

  it('devuelve un camino vacío sin unidades', () => {
    expect(buildLearningPath([])).toEqual({ ok: true, items: [] });
  });

  it('rechaza órdenes repetidos de unidades', () => {
    expect(
      buildLearningPath([
        unit('u1', 1, [level('a', 1)]),
        unit('u2', 1, [level('b', 1)]),
      ]),
    ).toEqual({ ok: false, code: 'DUPLICATE_UNIT_ORDER', orden: 1 });
  });

  it('rechaza órdenes repetidos de niveles en una unidad', () => {
    expect(
      buildLearningPath([unit('u1', 1, [level('a', 1), level('b', 1)])]),
    ).toEqual({
      ok: false,
      code: 'DUPLICATE_LEVEL_ORDER',
      unidadId: 'u1',
      orden: 1,
    });
  });
});
