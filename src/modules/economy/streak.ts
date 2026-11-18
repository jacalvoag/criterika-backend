/**
 * Daily streak rules from the OpenAPI contract (info description, schemas
 * Streak and StartAttemptInput, scenarios "Repetir nivel completado y aprobar"
 * and "Cambio de fecha local hacia atrás por zona"):
 * - The local date comes from the server approval instant and the IANA zone
 *   fixed when the attempt started.
 * - Same local date adds nothing, the next one adds one, a gap restarts at
 *   one, and an earlier date neither adds nor moves the last date back.
 * - Repeated approvals count, so the caller does not distinguish them here.
 *
 * The stored zone belongs to the last credited milestone: it only changes when
 * a new day is credited. Pure function: it never reads the clock.
 */
const MS_PER_DAY = 86_400_000;
const UTC_OFFSET_PATTERN = /^[+-]/;

export interface StreakState {
  dias: number;
  ultimaFechaLocalAprobada: string | null;
  zonaHoraria: string;
}

export interface StreakApproval {
  racha: StreakState;
  aprobadaEn: Date;
  zonaHoraria: string;
}

export type StreakResult =
  { ok: true; racha: StreakState } | { ok: false; reason: 'INVALID_TIME_ZONE' };

function createDateFormatter(timeZone: string): Intl.DateTimeFormat | null {
  // Intl also accepts UTC offsets, which are not IANA identifiers.
  if (UTC_OFFSET_PATTERN.test(timeZone)) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      calendar: 'iso8601',
      numberingSystem: 'latn',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return null;
  }
}

function formatLocalDate(
  formatter: Intl.DateTimeFormat,
  instant: Date,
): string {
  const parts = formatter.formatToParts(instant);
  const valueOf = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';

  return `${valueOf('year')}-${valueOf('month')}-${valueOf('day')}`;
}

function daysBetween(fromDate: string, toDate: string): number {
  const from = Date.parse(`${fromDate}T00:00:00Z`);
  const to = Date.parse(`${toDate}T00:00:00Z`);

  return Math.round((to - from) / MS_PER_DAY);
}

export function calculateStreak(approval: StreakApproval): StreakResult {
  const { racha, aprobadaEn, zonaHoraria } = approval;
  const formatter = createDateFormatter(zonaHoraria);

  if (formatter === null) {
    return { ok: false, reason: 'INVALID_TIME_ZONE' };
  }

  const fechaLocal = formatLocalDate(formatter, aprobadaEn);
  const ultimaFecha = racha.ultimaFechaLocalAprobada;

  if (ultimaFecha === null) {
    return {
      ok: true,
      racha: { dias: 1, ultimaFechaLocalAprobada: fechaLocal, zonaHoraria },
    };
  }

  const diferencia = daysBetween(ultimaFecha, fechaLocal);

  if (diferencia <= 0) {
    return { ok: true, racha: { ...racha } };
  }

  return {
    ok: true,
    racha: {
      dias: diferencia === 1 ? racha.dias + 1 : 1,
      ultimaFechaLocalAprobada: fechaLocal,
      zonaHoraria,
    },
  };
}
