import type {
  BoardPlacement,
  BoardWordInput,
  GeneratedBoard,
  RandomSource,
} from './board-generation.types.js';
import type { Coordinate } from './coordinate.js';
import { evaluateCrossword } from './crossword-evaluation.js';
import { decideCrosswordExecution } from './crossword-execution-outcome.js';
import { generateCrosswordBoard } from './crossword-generation.js';
import { evaluateWordSearch } from './word-search-evaluation.js';
import { decideWordSearchExecution } from './word-search-execution-outcome.js';
import { generateWordSearchBoard } from './word-search-generation.js';

/** Deterministic generator (mulberry32) so every board is reproducible. */
function seeded(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS: BoardWordInput[] = [
  { id: '11111111-1111-4111-8111-111111111111', palabra: 'Derecho' },
  { id: '22222222-2222-4222-8222-222222222222', palabra: 'Petición' },
  { id: '33333333-3333-4333-8333-333333333333', palabra: 'Amparo' },
  { id: '44444444-4444-4444-8444-444444444444', palabra: 'Ley' },
  { id: '55555555-5555-4555-8555-555555555555', palabra: 'Señor' },
];

const SEEDS = [1, 7, 42, 2024, 99_999];

/** Last cell of a placement, as the player would end the selection. */
function endOf({ inicio, orientacion, textoNormalizado }: BoardPlacement) {
  const steps = Array.from(textoNormalizado).length - 1;
  return orientacion === 'HORIZONTAL'
    ? { fila: inicio.fila, columna: inicio.columna + steps }
    : { fila: inicio.fila + steps, columna: inicio.columna };
}

/** Letters of a placement read from the generated grid, not from the placement. */
function readPlacement(board: GeneratedBoard, placement: BoardPlacement) {
  const rows = board.cuadricula.map((row) => Array.from(row));
  const end = endOf(placement);
  const cells: Coordinate[] = [];
  for (let fila = placement.inicio.fila; fila <= end.fila; fila++) {
    for (
      let columna = placement.inicio.columna;
      columna <= end.columna;
      columna++
    ) {
      cells.push({ fila, columna });
    }
  }
  return cells.map(({ fila, columna }) => rows[fila]?.[columna] ?? '').join('');
}

function generated(result: ReturnType<typeof generateWordSearchBoard>) {
  if (!result.ok) throw new Error(`board not generated: ${result.reason}`);
  return result.board;
}

const definitionWords = WORDS.map(({ id, palabra }) => ({
  id,
  texto: palabra,
}));

describe('ida y vuelta de tableros generados', () => {
  it.each(SEEDS)(
    'resuelve la sopa generada con la semilla %i y la ejecución queda SUPERADA',
    (seed) => {
      const board = generated(
        generateWordSearchBoard(
          WORDS,
          { filas: 10, columnas: 10 },
          seeded(seed),
        ),
      );
      const definition = {
        cuadricula: board.cuadricula,
        palabras: definitionWords,
      };
      const encontradasIds: string[] = [];

      board.ubicaciones.forEach((placement, index) => {
        // Odd placements are selected backwards, which the contract allows.
        const forwards = index % 2 === 0;
        const inicio = forwards ? placement.inicio : endOf(placement);
        const fin = forwards ? endOf(placement) : placement.inicio;
        const result = evaluateWordSearch(
          definition,
          { tipo: 'SOPA_LETRAS', inicio, fin },
          { encontradasIds },
        );

        expect(result).toEqual({
          ok: true,
          feedback: {
            tipo: 'SOPA_LETRAS',
            correcta: true,
            palabraId: placement.palabraId,
          },
        });
        encontradasIds.push(placement.palabraId);
      });

      expect(encontradasIds.toSorted()).toEqual(
        WORDS.map(({ id }) => id).toSorted(),
      );
      expect(
        decideWordSearchExecution({
          encontradas: encontradasIds.length,
          totalPalabras: WORDS.length,
        }),
      ).toEqual({ ok: true, resultadoEjecucion: 'SUPERADA' });
    },
  );

  it.each(SEEDS)(
    'resuelve el crucigrama generado con la semilla %i y la ejecución queda SUPERADA',
    (seed) => {
      const board = generated(
        generateCrosswordBoard(
          WORDS,
          { filas: 12, columnas: 12 },
          seeded(seed),
        ),
      );
      const respuestas = board.ubicaciones.map((placement) => ({
        palabraId: placement.palabraId,
        texto: readPlacement(board, placement),
      }));

      expect(respuestas.map(({ palabraId }) => palabraId).toSorted()).toEqual(
        WORDS.map(({ id }) => id).toSorted(),
      );
      expect(
        evaluateCrossword(
          { palabras: definitionWords },
          { tipo: 'CRUCIGRAMA', respuestas },
        ),
      ).toEqual({
        ok: true,
        feedback: {
          tipo: 'CRUCIGRAMA',
          correcta: true,
          palabrasIncorrectasIds: [],
        },
      });
      expect(
        decideCrosswordExecution({
          comprobacionesIncorrectas: 0,
          ultimaComprobacionCorrecta: true,
        }),
      ).toEqual({ ok: true, resultadoEjecucion: 'SUPERADA' });
    },
  );
});
