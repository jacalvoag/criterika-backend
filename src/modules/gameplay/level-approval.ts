/**
 * Level approval rule from the OpenAPI contract
 * (info.description "Reglas de juego", Attempt.estado, Attempt.motivoFinalizacion):
 * the level is approved only when every activity is passed (TODAS_SUPERADAS);
 * the third failure of any activity ends it as FALLIDO (TERCER_FALLO).
 * Rewards are not granted here: economy applies them.
 */
export const MIN_ACTIVITIES_PER_ATTEMPT = 3;
export const MAX_ACTIVITIES_PER_ATTEMPT = 6;

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
      valid: true;
      estado: 'APROBADO';
      motivoFinalizacion: 'TODAS_SUPERADAS';
    } & LevelProgress)
  | ({
      valid: true;
      estado: 'FALLIDO';
      motivoFinalizacion: 'TERCER_FALLO';
    } & LevelProgress)
  | ({
      valid: true;
      estado: 'EN_CURSO';
      motivoFinalizacion: null;
    } & LevelProgress)
  | { valid: false; reason: LevelApprovalViolation };

/**
 * Derives the level outcome from the state of each attempt activity.
 */
export function evaluateLevelApproval(
  estados: readonly AttemptActivityStatus[],
): LevelApprovalResult {
  const totalActividades = estados.length;

  if (
    totalActividades < MIN_ACTIVITIES_PER_ATTEMPT ||
    totalActividades > MAX_ACTIVITIES_PER_ATTEMPT
  ) {
    return { valid: false, reason: 'INVALID_ACTIVITY_COUNT' };
  }

  const agotadas = estados.filter((estado) => estado === 'AGOTADA').length;
  if (agotadas > 1) {
    return { valid: false, reason: 'MULTIPLE_EXHAUSTED_ACTIVITIES' };
  }

  const actividadesSuperadas = estados.filter(
    (estado) => estado === 'SUPERADA',
  ).length;
  const progress = { actividadesSuperadas, totalActividades };

  if (agotadas === 1) {
    return {
      valid: true,
      estado: 'FALLIDO',
      motivoFinalizacion: 'TERCER_FALLO',
      ...progress,
    };
  }
  if (actividadesSuperadas === totalActividades) {
    return {
      valid: true,
      estado: 'APROBADO',
      motivoFinalizacion: 'TODAS_SUPERADAS',
      ...progress,
    };
  }
  return {
    valid: true,
    estado: 'EN_CURSO',
    motivoFinalizacion: null,
    ...progress,
  };
}
