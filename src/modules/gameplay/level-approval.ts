import {
  MAX_ACTIVITIES,
  MIN_ACTIVITIES,
} from '../content/level-composition.js';

/**
 * Level approval rule from the OpenAPI contract
 * (info.description "Reglas de juego", Attempt.estado, Attempt.motivoFinalizacion):
 * the level is approved only when every activity is passed (TODAS_SUPERADAS);
 * the third failure of any activity ends it as FALLIDO (TERCER_FALLO).
 * Rewards are not granted here: economy applies them.
 */

/** Activity state inside an attempt (AttemptActivity.estado). */
export type AttemptActivityStatus =
  | 'PENDIENTE'
  | 'EN_EJECUCION'
  | 'PENDIENTE_RECUPERACION'
  | 'SUPERADA'
  | 'AGOTADA';

/** Internal reasons for an impossible attempt; the contract has no code for them. */
export type LevelApprovalViolation =
  'INVALID_ACTIVITY_COUNT' | 'MULTIPLE_EXHAUSTED_ACTIVITIES';

interface LevelProgress {
  actividadesSuperadas: number;
  totalActividades: number;
}

export type LevelApprovalResult =
  | ({
      ok: true;
      estado: 'APROBADO';
      motivoFinalizacion: 'TODAS_SUPERADAS';
    } & LevelProgress)
  | ({
      ok: true;
      estado: 'FALLIDO';
      motivoFinalizacion: 'TERCER_FALLO';
    } & LevelProgress)
  | ({
      ok: true;
      estado: 'EN_CURSO';
      motivoFinalizacion: null;
    } & LevelProgress)
  | { ok: false; reason: LevelApprovalViolation };

/**
 * Derives the level outcome from the state of each attempt activity.
 */
export function evaluateLevelApproval(
  estados: readonly AttemptActivityStatus[],
): LevelApprovalResult {
  const totalActividades = estados.length;

  if (totalActividades < MIN_ACTIVITIES || totalActividades > MAX_ACTIVITIES) {
    return { ok: false, reason: 'INVALID_ACTIVITY_COUNT' };
  }

  const agotadas = estados.filter((estado) => estado === 'AGOTADA').length;
  if (agotadas > 1) {
    return { ok: false, reason: 'MULTIPLE_EXHAUSTED_ACTIVITIES' };
  }

  const actividadesSuperadas = estados.filter(
    (estado) => estado === 'SUPERADA',
  ).length;
  const progress = { actividadesSuperadas, totalActividades };

  if (agotadas === 1) {
    return {
      ok: true,
      estado: 'FALLIDO',
      motivoFinalizacion: 'TERCER_FALLO',
      ...progress,
    };
  }
  if (actividadesSuperadas === totalActividades) {
    return {
      ok: true,
      estado: 'APROBADO',
      motivoFinalizacion: 'TODAS_SUPERADAS',
      ...progress,
    };
  }
  return {
    ok: true,
    estado: 'EN_CURSO',
    motivoFinalizacion: null,
    ...progress,
  };
}
