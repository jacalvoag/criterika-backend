/**
 * Execution rules per activity from the OpenAPI contract
 * (info.description "Reglas de juego", AttemptActivity, Attempt.motivoFinalizacion):
 * one initial execution and two recoveries, three at most.
 * A recoverable failure keeps the activity pending; the third failure
 * exhausts it (AGOTADA), ends the level with TERCER_FALLO and consumes
 * exactly one life (x-acceptance-scenarios "Tercer fallo de una actividad").
 * Balances are not touched here: economy applies the life consumption.
 */
export const MAX_EXECUTIONS_PER_ACTIVITY = 3;

/** Final outcome of an evaluated execution (GameActionResult.resultadoEjecucion). */
export type ExecutionOutcome = 'SUPERADA' | 'FALLIDA';

/** Internal reasons for an impossible history; the contract has no code for them. */
export type ExecutionHistoryViolation =
  'EXECUTION_LIMIT_EXCEEDED' | 'EXECUTION_AFTER_PASS';

export type ActivityExecutionsResult =
  | {
      valid: true;
      estado: 'PENDIENTE' | 'PENDIENTE_RECUPERACION';
      ejecucionesIniciadas: number;
      puedeEjecutar: true;
      esRecuperacion: boolean;
    }
  | {
      valid: true;
      estado: 'SUPERADA';
      ejecucionesIniciadas: number;
      puedeEjecutar: false;
    }
  | {
      valid: true;
      estado: 'AGOTADA';
      ejecucionesIniciadas: number;
      puedeEjecutar: false;
      motivoFinalizacion: 'TERCER_FALLO';
      consumeVida: true;
    }
  | { valid: false; reason: ExecutionHistoryViolation };

export type StartExecutionResult =
  | { allowed: true; esRecuperacion: boolean }
  | {
      allowed: false;
      reason:
        | 'EXECUTION_LIMIT_REACHED'
        | 'ACTIVITY_ALREADY_PASSED'
        | ExecutionHistoryViolation;
    };

/**
 * Derives the activity state from its finished executions, in order.
 */
export function evaluateActivityExecutions(
  history: readonly ExecutionOutcome[],
): ActivityExecutionsResult {
  const ejecucionesIniciadas = history.length;

  if (ejecucionesIniciadas > MAX_EXECUTIONS_PER_ACTIVITY) {
    return { valid: false, reason: 'EXECUTION_LIMIT_EXCEEDED' };
  }

  const passIndex = history.indexOf('SUPERADA');
  if (passIndex !== -1) {
    if (passIndex !== ejecucionesIniciadas - 1) {
      return { valid: false, reason: 'EXECUTION_AFTER_PASS' };
    }
    return {
      valid: true,
      estado: 'SUPERADA',
      ejecucionesIniciadas,
      puedeEjecutar: false,
    };
  }

  if (ejecucionesIniciadas === MAX_EXECUTIONS_PER_ACTIVITY) {
    return {
      valid: true,
      estado: 'AGOTADA',
      ejecucionesIniciadas,
      puedeEjecutar: false,
      motivoFinalizacion: 'TERCER_FALLO',
      consumeVida: true,
    };
  }

  const esRecuperacion = ejecucionesIniciadas > 0;
  return {
    valid: true,
    estado: esRecuperacion ? 'PENDIENTE_RECUPERACION' : 'PENDIENTE',
    ejecucionesIniciadas,
    puedeEjecutar: true,
    esRecuperacion,
  };
}

/**
 * Decides whether another execution of the activity may be created.
 */
export function canStartExecution(
  history: readonly ExecutionOutcome[],
): StartExecutionResult {
  const result = evaluateActivityExecutions(history);

  if (!result.valid) {
    return { allowed: false, reason: result.reason };
  }
  if (result.estado === 'SUPERADA') {
    return { allowed: false, reason: 'ACTIVITY_ALREADY_PASSED' };
  }
  if (result.estado === 'AGOTADA') {
    return { allowed: false, reason: 'EXECUTION_LIMIT_REACHED' };
  }
  return { allowed: true, esRecuperacion: result.esRecuperacion };
}
