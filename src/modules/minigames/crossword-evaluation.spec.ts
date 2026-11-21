import { evaluateCrossword } from './crossword-evaluation.js';
import {
  CROSSWORD_REJECTION_REASONS,
  type CrosswordDefinition,
  type CrosswordEntry,
} from './crossword-evaluation.types.js';

const ETICA_ID = '00000000-0000-4000-8000-000000000040';
const NORMA_ID = '00000000-0000-4000-8000-000000000041';
const NINO_ID = '00000000-0000-4000-8000-000000000042';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000099';

const definition: CrosswordDefinition = {
  palabras: [
    { id: ETICA_ID, texto: 'Ética' },
    { id: NORMA_ID, texto: 'Norma' },
    { id: NINO_ID, texto: 'Niño' },
  ],
};

function check(...respuestas: CrosswordEntry[]) {
  return { tipo: 'CRUCIGRAMA' as const, respuestas };
}

const etica = (texto = 'ETICA') => ({ palabraId: ETICA_ID, texto });
const norma = (texto = 'NORMA') => ({ palabraId: NORMA_ID, texto });
const nino = (texto = 'NIÑO') => ({ palabraId: NINO_ID, texto });

describe('evaluateCrossword', () => {
  it('define los motivos de rechazo de una comprobación mal formada', () => {
    expect(CROSSWORD_REJECTION_REASONS).toEqual([
      'DUPLICATE_ENTRY',
      'WORD_NOT_FOUND',
      'MISSING_ENTRY',
    ]);
  });

  it('marca correcta la comprobación con todas las palabras bien', () => {
    expect(
      evaluateCrossword(definition, check(etica(), norma(), nino())),
    ).toEqual({
      ok: true,
      feedback: {
        tipo: 'CRUCIGRAMA',
        correcta: true,
        palabrasIncorrectasIds: [],
      },
    });
  });

  it('compara con normalizeWordText: mayúsculas, tildes, espacios y puntuación', () => {
    expect(
      evaluateCrossword(
        definition,
        check(etica(' é-tica '), norma('norma.'), nino('niño')),
      ),
    ).toMatchObject({ ok: true, feedback: { correcta: true } });
  });

  it('distingue Ñ de N', () => {
    expect(
      evaluateCrossword(definition, check(etica(), norma(), nino('NINO'))),
    ).toEqual({
      ok: true,
      feedback: {
        tipo: 'CRUCIGRAMA',
        correcta: false,
        palabrasIncorrectasIds: [NINO_ID],
      },
    });
  });

  it('lista solo las palabras incorrectas, sin revelar las soluciones', () => {
    expect(
      evaluateCrossword(
        definition,
        check(norma('NORMAS'), nino(), etica('MORAL')),
      ),
    ).toEqual({
      ok: true,
      feedback: {
        tipo: 'CRUCIGRAMA',
        correcta: false,
        palabrasIncorrectasIds: [ETICA_ID, NORMA_ID],
      },
    });
  });

  it('cuenta como incorrecta una respuesta vacía al normalizar', () => {
    expect(
      evaluateCrossword(definition, check(etica(''), norma(' .- '), nino())),
    ).toEqual({
      ok: true,
      feedback: {
        tipo: 'CRUCIGRAMA',
        correcta: false,
        palabrasIncorrectasIds: [ETICA_ID, NORMA_ID],
      },
    });
  });

  it('rechaza una pista repetida', () => {
    expect(
      evaluateCrossword(definition, check(etica(), etica(), norma(), nino())),
    ).toEqual({ ok: false, reason: 'DUPLICATE_ENTRY' });
  });

  it('rechaza una pista que no pertenece al crucigrama', () => {
    expect(
      evaluateCrossword(
        definition,
        check(etica(), norma(), { palabraId: UNKNOWN_ID, texto: 'NIÑO' }),
      ),
    ).toEqual({ ok: false, reason: 'WORD_NOT_FOUND' });
  });

  it('rechaza una comprobación sin entrada para cada pista', () => {
    expect(evaluateCrossword(definition, check(etica(), norma()))).toEqual({
      ok: false,
      reason: 'MISSING_ENTRY',
    });
  });
});
