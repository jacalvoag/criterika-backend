/** The versions and purpose codes shown to the person registering. */
export interface RegistrationLegalSelection {
  termsVersionId: string;
  privacyVersionId: string;
  purposeCodes: readonly string[];
}

/** Obtained from the currently published legal documents by the caller. */
export interface CurrentRegistrationLegalSelection {
  termsVersionId: string;
  privacyVersionId: string;
  purposes: readonly { code: string; necessary: boolean }[];
}

export type RegistrationLegalSelectionResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'LEGAL_CONFIGURATION_MISSING'
        | 'LEGAL_VERSION_OUTDATED'
        | 'INVALID_PURPOSES';
    };

/**
 * Compare a previously presented selection with the current published snapshot.
 * The caller obtains the snapshot under the locks required by the operation;
 * this pure check cannot guarantee that the documents remain current by itself.
 */
export function validateRegistrationLegalSelection(
  selection: RegistrationLegalSelection,
  current: CurrentRegistrationLegalSelection | null,
): RegistrationLegalSelectionResult {
  if (current === null) {
    return { ok: false, reason: 'LEGAL_CONFIGURATION_MISSING' };
  }

  if (
    selection.termsVersionId.toLowerCase() !==
      current.termsVersionId.toLowerCase() ||
    selection.privacyVersionId.toLowerCase() !==
      current.privacyVersionId.toLowerCase()
  ) {
    return { ok: false, reason: 'LEGAL_VERSION_OUTDATED' };
  }

  const selected = new Set(selection.purposeCodes);
  const allowed = new Set(current.purposes.map((purpose) => purpose.code));
  if (
    selection.purposeCodes.length < 1 ||
    selection.purposeCodes.length > 30 ||
    selected.size !== selection.purposeCodes.length ||
    selection.purposeCodes.some(
      (code) =>
        !/^[a-z][a-z0-9_]{2,63}(?![\s\S])/.test(code) || !allowed.has(code),
    ) ||
    current.purposes.some(
      (purpose) => purpose.necessary && !selected.has(purpose.code),
    )
  ) {
    return { ok: false, reason: 'INVALID_PURPOSES' };
  }

  return { ok: true };
}
