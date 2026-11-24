export type LeapDayAnniversary = 'FEBRUARY_28' | 'MARCH_1';

export type RegistrationEligibility =
  { ok: true } | { ok: false; reason: 'INVALID_BIRTH_DATE' | 'UNDERAGE' };

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function parseCalendarDate(value: string): CalendarDate | null {
  if (value.length !== 10) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const days = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > days[month - 1]!
  ) {
    return null;
  }
  return { year, month, day };
}

/**
 * Uses calendar dates, never timezone conversion. The caller supplies the
 * server's registration date and the agreed February 29 anniversary policy.
 */
export function checkRegistrationAge(
  birthDate: string,
  registrationDate: string,
  leapDayAnniversary: LeapDayAnniversary,
): RegistrationEligibility {
  const birth = parseCalendarDate(birthDate);
  const today = parseCalendarDate(registrationDate);
  if (today === null) throw new RangeError('Fecha de registro inválida.');
  if (birth === null || birthDate > registrationDate) {
    return { ok: false, reason: 'INVALID_BIRTH_DATE' };
  }

  const eighteenthYear = birth.year + 18;
  let month = birth.month;
  let day = birth.day;
  if (month === 2 && day === 29 && !isLeapYear(eighteenthYear)) {
    if (leapDayAnniversary === 'FEBRUARY_28') day = 28;
    else {
      month = 3;
      day = 1;
    }
  }

  const eligible =
    today.year > eighteenthYear ||
    (today.year === eighteenthYear &&
      (today.month > month || (today.month === month && today.day >= day)));
  return eligible ? { ok: true } : { ok: false, reason: 'UNDERAGE' };
}
