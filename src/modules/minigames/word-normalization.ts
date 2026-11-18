const DECOMPOSED_ENYE = /Ñ/g;
const COMPOSED_ENYE = 'Ñ';
const COMBINING_MARKS = /\p{M}/gu;
const WHITESPACE_AND_PUNCTUATION = /[\s\p{P}]/gu;
const INVISIBLE_FORMAT_CHARACTERS = /\p{Cf}/gu;

/**
 * Normalizes text to compare crossword answers and word search words
 * (`info.description` and BoardPlacement.textoNormalizado in the OpenAPI contract).
 *
 * Digits and symbols are kept on purpose: removing them would make different
 * words equal, and the BoardPlacement.textoNormalizado pattern rejects them
 * when the board is generated.
 *
 * Invisible format characters go first, so one placed between an N and its
 * combining tilde cannot turn Ñ into N.
 */
export function normalizeWordText(text: string): string {
  return text
    .replace(INVISIBLE_FORMAT_CHARACTERS, '')
    .toUpperCase()
    .normalize('NFD')
    .replace(DECOMPOSED_ENYE, COMPOSED_ENYE)
    .replace(COMBINING_MARKS, '')
    .replace(WHITESPACE_AND_PUNCTUATION, '');
}
