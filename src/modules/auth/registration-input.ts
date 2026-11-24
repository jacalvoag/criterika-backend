import { parseAcceptanceInput } from '../legal/acceptance-input.js';
import type { RegistrationLegalSelection } from '../legal/registration-selection.js';
import { checkRegistrationAge } from './registration-eligibility.js';
import type { LeapDayAnniversary } from './registration-eligibility.js';
import { normalizeRegistrationEmail } from './registration-email.js';
import { isRegistrationPasswordLengthValid } from './registration-password.js';

interface RegistrationDatePolicy {
  serverDate: string;
  leapDayAnniversary: LeapDayAnniversary;
}

interface RegistrationInput {
  name: string;
  surnames: string;
  birthDate: string;
  normalizedEmail: string;
  password: string;
  legalSelection: RegistrationLegalSelection;
}

type RegistrationInputResult =
  | { ok: true; value: RegistrationInput }
  | {
      ok: false;
      reason:
        | 'INVALID_BODY'
        | 'INVALID_NAME'
        | 'INVALID_SURNAMES'
        | 'INVALID_BIRTH_DATE'
        | 'UNDERAGE'
        | 'INVALID_EMAIL'
        | 'INVALID_PASSWORD'
        | 'INVALID_ACCEPTANCE';
    };

const fields = [
  'nombre',
  'apellidos',
  'fechaNacimiento',
  'correo',
  'contrasena',
  'aceptacion',
];
const emailAtom = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+$/i;
const domainLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

function isName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    !value.includes('\0') &&
    Array.from(value).length <= 120
  );
}

function isMailbox(value: string): boolean {
  const parts = value.split('@');
  if (value.length > 254 || parts.length !== 2) return false;
  const [local, domain] = parts;
  return (
    local.length <= 64 &&
    !/\s/.test(value) &&
    local.split('.').every((atom) => emailAtom.test(atom)) &&
    domain.split('.').every((label) => domainLabel.test(label))
  );
}

/** Validates a registration body. The date policy comes from the server. */
export function parseRegistrationInput(
  input: unknown,
  policy: RegistrationDatePolicy,
): RegistrationInputResult {
  if (
    input === null ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).length !== fields.length ||
    !fields.every((field) => Object.hasOwn(input, field))
  ) {
    return { ok: false, reason: 'INVALID_BODY' };
  }

  const { nombre, apellidos, fechaNacimiento, correo, contrasena, aceptacion } =
    input as Record<string, unknown>;
  if (!isName(nombre)) return { ok: false, reason: 'INVALID_NAME' };
  if (!isName(apellidos)) return { ok: false, reason: 'INVALID_SURNAMES' };
  if (typeof fechaNacimiento !== 'string')
    return { ok: false, reason: 'INVALID_BIRTH_DATE' };
  const age = checkRegistrationAge(
    fechaNacimiento,
    policy.serverDate,
    policy.leapDayAnniversary,
  );
  if (!age.ok) return age;

  if (typeof correo !== 'string' || !isMailbox(correo.trim())) {
    return { ok: false, reason: 'INVALID_EMAIL' };
  }
  if (
    typeof contrasena !== 'string' ||
    !isRegistrationPasswordLengthValid(contrasena)
  ) {
    return { ok: false, reason: 'INVALID_PASSWORD' };
  }

  const legal = parseAcceptanceInput(aceptacion);
  if (!legal.ok) return legal;

  return {
    ok: true,
    value: {
      name: nombre.trim(),
      surnames: apellidos.trim(),
      birthDate: fechaNacimiento,
      normalizedEmail: normalizeRegistrationEmail(correo),
      password: contrasena,
      legalSelection: {
        termsVersionId: legal.value.terminosVersionId.toLowerCase(),
        privacyVersionId: legal.value.avisoVersionId.toLowerCase(),
        purposeCodes: legal.value.consienteFinalidadesIds,
      },
    },
  };
}
