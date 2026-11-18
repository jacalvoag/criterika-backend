/** Values of Attempt.estado in the OpenAPI contract. */
export type AttemptStatus =
  'EN_CURSO' | 'APROBADO' | 'FALLIDO' | 'ABANDONADO' | 'CANCELADO';

export type TerminalAttemptStatus = Exclude<AttemptStatus, 'EN_CURSO'>;

export interface AttemptHeartbeatState {
  estado: AttemptStatus;
  ultimaComunicacionEn: Date;
}

export interface HeartbeatRenewed {
  ok: true;
  resolucion: 'RENOVADO';
  estado: 'EN_CURSO';
  ultimaComunicacionEn: Date;
  limiteComunicacionEn: Date;
}

export interface HeartbeatTimedOut {
  ok: false;
  resolucion: 'ABANDONADO_POR_TIMEOUT';
  estado: 'ABANDONADO';
  motivoFinalizacion: 'TIMEOUT';
  finalizadoEn: Date;
  consumeVida: true;
  limiteComunicacionEn: Date;
}

export interface HeartbeatAlreadyFinished {
  ok: false;
  resolucion: 'YA_TERMINADO';
  estado: TerminalAttemptStatus;
  consumeVida: false;
  limiteComunicacionEn: Date;
}

export type HeartbeatResolution =
  HeartbeatRenewed | HeartbeatTimedOut | HeartbeatAlreadyFinished;
