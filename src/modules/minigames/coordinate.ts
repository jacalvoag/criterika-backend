/**
 * Zero-based board cell, shared by board generation and word search
 * evaluation. Mirrors Coordinate in the OpenAPI contract (fila and columna,
 * integers from 0 to 19).
 */
export interface Coordinate {
  fila: number;
  columna: number;
}
