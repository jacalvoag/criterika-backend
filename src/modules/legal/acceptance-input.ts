/** HTTP structure in AcceptanceInput. The field name contains stable purpose codes. */
export interface AcceptanceInput {
  terminosVersionId: string;
  avisoVersionId: string;
  aceptaTerminos: true;
  reconoceAvisoPresentado: true;
  consienteFinalidadesIds: string[];
}

export type AcceptanceInputResult =
  | { ok: true; value: AcceptanceInput }
  | { ok: false; reason: 'INVALID_ACCEPTANCE' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PURPOSE = /^[a-z][a-z0-9_]{2,63}(?![\s\S])/;
const FIELDS = new Set([
  'terminosVersionId',
  'avisoVersionId',
  'aceptaTerminos',
  'reconoceAvisoPresentado',
  'consienteFinalidadesIds',
]);

/** Structural check only; the current published selection must also be validated. */
export function parseAcceptanceInput(input: unknown): AcceptanceInputResult {
  const invalid: AcceptanceInputResult = {
    ok: false,
    reason: 'INVALID_ACCEPTANCE',
  };
  if (input === null || typeof input !== 'object' || Array.isArray(input))
    return invalid;
  const value = input as Record<string, unknown>;
  if (
    Object.keys(value).some((key) => !FIELDS.has(key)) ||
    typeof value.terminosVersionId !== 'string' ||
    value.terminosVersionId.length !== 36 ||
    !UUID.test(value.terminosVersionId) ||
    typeof value.avisoVersionId !== 'string' ||
    value.avisoVersionId.length !== 36 ||
    !UUID.test(value.avisoVersionId) ||
    value.aceptaTerminos !== true ||
    value.reconoceAvisoPresentado !== true ||
    !Array.isArray(value.consienteFinalidadesIds) ||
    value.consienteFinalidadesIds.length < 1 ||
    value.consienteFinalidadesIds.length > 30 ||
    value.consienteFinalidadesIds.some(
      (code: unknown) => typeof code !== 'string' || !PURPOSE.test(code),
    ) ||
    new Set(value.consienteFinalidadesIds).size !==
      value.consienteFinalidadesIds.length
  ) {
    return invalid;
  }

  return {
    ok: true,
    value: {
      terminosVersionId: value.terminosVersionId,
      avisoVersionId: value.avisoVersionId,
      aceptaTerminos: true,
      reconoceAvisoPresentado: true,
      consienteFinalidadesIds: [...value.consienteFinalidadesIds] as string[],
    },
  };
}
