import { evaluateLevelApproval } from './level-approval.js';

describe('evaluateLevelApproval', () => {
  it('aprueba el nivel cuando todas las actividades están superadas', () => {
    expect(evaluateLevelApproval(['SUPERADA', 'SUPERADA', 'SUPERADA'])).toEqual(
      {
        valid: true,
        estado: 'APROBADO',
        motivoFinalizacion: 'TODAS_SUPERADAS',
        actividadesSuperadas: 3,
        totalActividades: 3,
      },
    );
  });

  it('sigue en curso cuando una actividad está pendiente', () => {
    expect(
      evaluateLevelApproval(['SUPERADA', 'PENDIENTE', 'SUPERADA', 'SUPERADA']),
    ).toEqual({
      valid: true,
      estado: 'EN_CURSO',
      motivoFinalizacion: null,
      actividadesSuperadas: 3,
      totalActividades: 4,
    });
  });

  it('sigue en curso cuando una actividad está en ejecución', () => {
    expect(
      evaluateLevelApproval(['SUPERADA', 'EN_EJECUCION', 'SUPERADA']),
    ).toMatchObject({
      valid: true,
      estado: 'EN_CURSO',
      actividadesSuperadas: 2,
    });
  });

  it('sigue en curso cuando una actividad espera recuperación', () => {
    expect(
      evaluateLevelApproval(['PENDIENTE_RECUPERACION', 'SUPERADA', 'SUPERADA']),
    ).toMatchObject({
      valid: true,
      estado: 'EN_CURSO',
      motivoFinalizacion: null,
    });
  });

  it('falla el nivel cuando una actividad quedó agotada', () => {
    expect(evaluateLevelApproval(['SUPERADA', 'AGOTADA', 'SUPERADA'])).toEqual({
      valid: true,
      estado: 'FALLIDO',
      motivoFinalizacion: 'TERCER_FALLO',
      actividadesSuperadas: 2,
      totalActividades: 3,
    });
  });

  it('falla el nivel aunque queden actividades pendientes', () => {
    expect(
      evaluateLevelApproval([
        'AGOTADA',
        'PENDIENTE',
        'PENDIENTE_RECUPERACION',
        'SUPERADA',
        'PENDIENTE',
        'PENDIENTE',
      ]),
    ).toMatchObject({
      valid: true,
      estado: 'FALLIDO',
      motivoFinalizacion: 'TERCER_FALLO',
      actividadesSuperadas: 1,
      totalActividades: 6,
    });
  });

  it('acepta seis actividades superadas', () => {
    expect(
      evaluateLevelApproval([
        'SUPERADA',
        'SUPERADA',
        'SUPERADA',
        'SUPERADA',
        'SUPERADA',
        'SUPERADA',
      ]),
    ).toMatchObject({ valid: true, estado: 'APROBADO', totalActividades: 6 });
  });

  it('rechaza un intento sin actividades', () => {
    expect(evaluateLevelApproval([])).toEqual({
      valid: false,
      reason: 'INVALID_ACTIVITY_COUNT',
    });
  });

  it('rechaza un intento con dos actividades', () => {
    expect(evaluateLevelApproval(['SUPERADA', 'SUPERADA'])).toEqual({
      valid: false,
      reason: 'INVALID_ACTIVITY_COUNT',
    });
  });

  it('rechaza un intento con siete actividades', () => {
    expect(
      evaluateLevelApproval([
        'SUPERADA',
        'SUPERADA',
        'SUPERADA',
        'SUPERADA',
        'SUPERADA',
        'SUPERADA',
        'SUPERADA',
      ]),
    ).toEqual({ valid: false, reason: 'INVALID_ACTIVITY_COUNT' });
  });

  it('rechaza un intento con dos actividades agotadas', () => {
    expect(evaluateLevelApproval(['AGOTADA', 'AGOTADA', 'SUPERADA'])).toEqual({
      valid: false,
      reason: 'MULTIPLE_EXHAUSTED_ACTIVITIES',
    });
  });
});
