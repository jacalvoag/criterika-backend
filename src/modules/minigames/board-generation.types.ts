/** Board cell (Coordinate in the OpenAPI contract). */
export interface Coordinate {
  fila: number;
  columna: number;
}

/** BoardPlacement.orientacion in the OpenAPI contract. */
export type BoardOrientation = 'HORIZONTAL' | 'VERTICAL';

/** Where one word sits on a generated board (BoardPlacement). */
export interface BoardPlacement {
  palabraId: string;
  textoNormalizado: string;
  inicio: Coordinate;
  orientacion: BoardOrientation;
}

/** Board size requested by the activity (BoardConfiguration, 2 to 20 each). */
export interface BoardConfiguration {
  filas: number;
  columnas: number;
}

/** Word to place, taken from WordClueInput (id and palabra). */
export interface BoardWordInput {
  id: string;
  palabra: string;
}

/** Generated board types (BoardGeneration.tipo). */
export type BoardType = 'SOPA_LETRAS' | 'CRUCIGRAMA';

/**
 * Pure part of BoardGeneration. The id, actividadId, aprobada and generadaEn
 * fields belong to the service that stores the candidate.
 * Crossword empty cells are `#` (BoardGeneration.cuadricula pattern).
 */
export interface GeneratedBoard {
  tipo: BoardType;
  filas: number;
  columnas: number;
  cuadricula: string[];
  ubicaciones: BoardPlacement[];
}

/**
 * INVALID_BOARD_SIZE: filas or columnas outside 2 to 20 (BoardConfiguration).
 * BOARD_NOT_GENERATABLE: no valid layout was found (generateActivityBoard, 422).
 */
export type BoardGenerationRejectionReason =
  'INVALID_BOARD_SIZE' | 'BOARD_NOT_GENERATABLE';

export type BoardGenerationResult =
  | { ok: true; board: GeneratedBoard }
  | { ok: false; reason: BoardGenerationRejectionReason };

/** Returns a number in [0, 1). Injected so generation is deterministic in tests. */
export type RandomSource = () => number;
