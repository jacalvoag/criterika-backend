import {
  canStartExecution,
  evaluateActivityExecutions,
  MAX_EXECUTIONS_PER_ACTIVITY,
} from './activity-executions.js';

describe('evaluateActivityExecutions', () => {
  it('permite la ejecución inicial cuando aún no hay ejecuciones', () => {
    expect(evaluateActivityExecutions([])).toEqual({
      valid: true,
      estado: 'PENDIENTE',
      ejecucionesIniciadas: 0,
      puedeEjecutar: true,
      esRecuperacion: false,
    });
  });

  it('aprueba la actividad en la primera ejecución', () => {
    expect(evaluateActivityExecutions(['SUPERADA'])).toEqual({
      valid: true,
      estado: 'SUPERADA',
      ejecucionesIniciadas: 1,
      puedeEjecutar: false,
    });
  });

  it('permite una recuperación tras un fallo recuperable', () => {
    expect(evaluateActivityExecutions(['FALLIDA'])).toEqual({
      valid: true,
      estado: 'PENDIENTE_RECUPERACION',
      ejecucionesIniciadas: 1,
      puedeEjecutar: true,
      esRecuperacion: true,
    });
  });

  it('permite la segunda y última recuperación tras dos fallos', () => {
    expect(evaluateActivityExecutions(['FALLIDA', 'FALLIDA'])).toEqual({
      valid: true,
      estado: 'PENDIENTE_RECUPERACION',
      ejecucionesIniciadas: 2,
      puedeEjecutar: true,
      esRecuperacion: true,
    });
  });

  it('aprueba en la tercera ejecución sin consumir vida', () => {
    const result = evaluateActivityExecutions([
      'FALLIDA',
      'FALLIDA',
      'SUPERADA',
    ]);

    expect(result).toEqual({
      valid: true,
      estado: 'SUPERADA',
      ejecucionesIniciadas: 3,
      puedeEjecutar: false,
    });
    expect(result).not.toHaveProperty('consumeVida');
  });

  it('agota la actividad en el tercer fallo, termina el nivel y consume una vida', () => {
    expect(
      evaluateActivityExecutions(['FALLIDA', 'FALLIDA', 'FALLIDA']),
    ).toEqual({
      valid: true,
      estado: 'AGOTADA',
      ejecucionesIniciadas: MAX_EXECUTIONS_PER_ACTIVITY,
      puedeEjecutar: false,
      motivoFinalizacion: 'TERCER_FALLO',
      consumeVida: true,
    });
  });

  it('rechaza un historial que supera el límite de ejecuciones', () => {
    expect(
      evaluateActivityExecutions(['FALLIDA', 'FALLIDA', 'FALLIDA', 'SUPERADA']),
    ).toEqual({ valid: false, reason: 'EXECUTION_LIMIT_EXCEEDED' });
  });

  it('rechaza un historial con ejecuciones después de aprobar', () => {
    expect(evaluateActivityExecutions(['SUPERADA', 'FALLIDA'])).toEqual({
      valid: false,
      reason: 'EXECUTION_AFTER_PASS',
    });
  });

  it('cuenta la ejecución inicial en curso como iniciada', () => {
    expect(evaluateActivityExecutions(['EN_CURSO'])).toEqual({
      valid: true,
      estado: 'EN_EJECUCION',
      ejecucionesIniciadas: 1,
      puedeEjecutar: false,
      esRecuperacion: false,
    });
  });

  it('marca como recuperación una ejecución en curso tras un fallo', () => {
    expect(evaluateActivityExecutions(['FALLIDA', 'EN_CURSO'])).toEqual({
      valid: true,
      estado: 'EN_EJECUCION',
      ejecucionesIniciadas: 2,
      puedeEjecutar: false,
      esRecuperacion: true,
    });
  });

  it('no agota la actividad mientras la tercera ejecución sigue en curso', () => {
    expect(
      evaluateActivityExecutions(['FALLIDA', 'FALLIDA', 'EN_CURSO']),
    ).toEqual({
      valid: true,
      estado: 'EN_EJECUCION',
      ejecucionesIniciadas: MAX_EXECUTIONS_PER_ACTIVITY,
      puedeEjecutar: false,
      esRecuperacion: true,
    });
  });

  it('rechaza una ejecución en curso que no sea la última del historial', () => {
    expect(evaluateActivityExecutions(['EN_CURSO', 'FALLIDA'])).toEqual({
      valid: false,
      reason: 'EXECUTION_AFTER_OPEN',
    });
  });

  it('rechaza dos ejecuciones en curso a la vez', () => {
    expect(evaluateActivityExecutions(['EN_CURSO', 'EN_CURSO'])).toEqual({
      valid: false,
      reason: 'EXECUTION_AFTER_OPEN',
    });
  });

  it('rechaza una ejecución en curso después de aprobar', () => {
    expect(evaluateActivityExecutions(['SUPERADA', 'EN_CURSO'])).toEqual({
      valid: false,
      reason: 'EXECUTION_AFTER_PASS',
    });
  });

  it('rechaza una cuarta ejecución en curso', () => {
    expect(
      evaluateActivityExecutions(['FALLIDA', 'FALLIDA', 'FALLIDA', 'EN_CURSO']),
    ).toEqual({ valid: false, reason: 'EXECUTION_LIMIT_EXCEEDED' });
  });
});

describe('canStartExecution', () => {
  it('permite la ejecución inicial', () => {
    expect(canStartExecution([])).toEqual({
      allowed: true,
      esRecuperacion: false,
    });
  });

  it('permite una recuperación con fallos por debajo del límite', () => {
    expect(canStartExecution(['FALLIDA', 'FALLIDA'])).toEqual({
      allowed: true,
      esRecuperacion: true,
    });
  });

  it('rechaza una cuarta ejecución tras tres fallos', () => {
    expect(canStartExecution(['FALLIDA', 'FALLIDA', 'FALLIDA'])).toEqual({
      allowed: false,
      reason: 'EXECUTION_LIMIT_REACHED',
    });
  });

  it('rechaza una nueva ejecución de una actividad ya aprobada', () => {
    expect(canStartExecution(['FALLIDA', 'SUPERADA'])).toEqual({
      allowed: false,
      reason: 'ACTIVITY_ALREADY_PASSED',
    });
  });

  it('rechaza otra ejecución mientras la inicial sigue abierta', () => {
    expect(canStartExecution(['EN_CURSO'])).toEqual({
      allowed: false,
      reason: 'EXECUTION_ALREADY_OPEN',
    });
  });

  it('rechaza otra ejecución mientras una recuperación sigue abierta', () => {
    expect(canStartExecution(['FALLIDA', 'EN_CURSO'])).toEqual({
      allowed: false,
      reason: 'EXECUTION_ALREADY_OPEN',
    });
  });

  it('devuelve como rechazo un historial imposible', () => {
    expect(canStartExecution(['SUPERADA', 'SUPERADA'])).toEqual({
      allowed: false,
      reason: 'EXECUTION_AFTER_PASS',
    });
  });
});
