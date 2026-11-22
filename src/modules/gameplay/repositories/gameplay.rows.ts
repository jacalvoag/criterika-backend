import type { ExecutionOutcome } from '../activity-executions.js';
import type { AttemptStatus } from '../attempt-heartbeat.types.js';
import type { AttemptActivityStatus } from '../level-approval.js';
import type { MinigameType } from '../../minigames/minigame-type.js';

export type AttemptFinishReason =
  | 'TODAS_SUPERADAS'
  | 'TERCER_FALLO'
  | 'SALIDA_CONFIRMADA'
  | 'INTERRUPCION'
  | 'TIMEOUT'
  | 'SANCION'
  | 'FALLO_SERVICIO'
  | 'PRIVACIDAD';
export interface AttemptRow {
  id: string;
  jugadorId: string;
  nivelId: string;
  unidadId: string;
  revisionId: string;
  estado: AttemptStatus;
  motivoFinalizacion: AttemptFinishReason | null;
  iniciadoEn: Date;
  ultimaComunicacionEn: Date;
  finalizadoEn: Date | null;
  zonaHoraria: string;
  gemasPrevistas: number;
  xpPrevista: number;
  cartaPrevistaId: string | null;
  siguienteOrdenPendiente: number;
}
export interface AttemptActivityRow {
  id: string;
  actividadId: string;
  tipo: MinigameType;
  posicionInicial: number;
  estado: AttemptActivityStatus;
  ordenPendiente: number | null;
  criterio: unknown;
  historial: ExecutionOutcome[];
}
export interface ExecutionRow {
  id: string;
  actividadIntentoId: string;
  intentoId: string;
  numero: number;
  estado: ExecutionOutcome;
  errores: number;
  estadoJuego: unknown;
  iniciadaEn: Date;
  finalizadaEn: Date | null;
}
export interface ExecutionDefinition {
  tipo: MinigameType;
  instrucciones: string;
  contenido: unknown;
  criterio: unknown;
}
/** Internal only: contenido contains solutions and must never be returned as HTTP. */
export interface CurrentExecutionRow {
  ejecucion: ExecutionRow;
  actividad: AttemptActivityRow;
  definicion: ExecutionDefinition;
}
