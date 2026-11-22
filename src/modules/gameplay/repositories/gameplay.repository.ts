import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  jsonObject,
  PersistenceInvariantError,
  requireOne,
  safeInteger,
} from '../../../database/persistence-values.js';
import type { ExecutionOutcome } from '../activity-executions.js';
import type { AttemptActivityStatus } from '../level-approval.js';
import type {
  AttemptRow,
  AttemptActivityRow,
  ExecutionRow,
  CurrentExecutionRow,
} from './gameplay.rows.js';

interface AttemptRecord extends Omit<AttemptRow, 'siguienteOrdenPendiente'> {
  siguienteOrdenPendiente: string;
}
interface ActivityRecord extends Omit<AttemptActivityRow, 'ordenPendiente'> {
  ordenPendiente: string | null;
}
interface ExecutionRecord extends ExecutionRow {
  actividadId: string;
  tipo: AttemptActivityRow['tipo'];
  posicionInicial: number;
  estadoActividad: AttemptActivityStatus;
  ordenPendiente: string | null;
  criterio: unknown;
  historial: ExecutionOutcome[];
  instrucciones: string;
  contenido: unknown;
}
export interface InsertAttemptInput {
  jugadorId: string;
  nivelId: string;
  revisionId: string;
  zonaHoraria: string;
  iniciadoEn: Date;
  gemasPrevistas: number;
  xpPrevista: number;
  cartaPrevistaId: string | null;
  actividades: { actividadId: string; posicionInicial: number }[];
  terminosIds: string[];
  primeraEjecucion: { estadoJuego: unknown };
}
export type FinishAttemptInput = { intentoId: string; finalizadoEn: Date } & (
  | { estado: 'APROBADO'; motivoFinalizacion: 'TODAS_SUPERADAS' }
  | { estado: 'FALLIDO'; motivoFinalizacion: 'TERCER_FALLO' }
  | {
      estado: 'ABANDONADO';
      motivoFinalizacion: 'SALIDA_CONFIRMADA' | 'INTERRUPCION' | 'TIMEOUT';
    }
  | {
      estado: 'CANCELADO';
      motivoFinalizacion: 'SANCION' | 'FALLO_SERVICIO' | 'PRIVACIDAD';
    }
);

const ATTEMPT_SELECT = `SELECT i.id,i.jugador_id AS "jugadorId",i.nivel_id AS "nivelId",n.unidad_id AS "unidadId",
 i.revision_id AS "revisionId",i.estado,i.motivo_finalizacion AS "motivoFinalizacion",
 i.iniciado_en AS "iniciadoEn",i.ultima_comunicacion_en AS "ultimaComunicacionEn",i.finalizado_en AS "finalizadoEn",
 i.zona_horaria AS "zonaHoraria",i.gemas_previstas AS "gemasPrevistas",i.xp_prevista AS "xpPrevista",
 i.carta_prevista_id AS "cartaPrevistaId",i.siguiente_orden_pendiente AS "siguienteOrdenPendiente"
 FROM criterika.intentos_nivel i JOIN criterika.niveles n ON n.id=i.nivel_id`;
const ACTIVITY_COLUMNS = `ai.id,ai.actividad_id AS "actividadId",ar.tipo,ai.posicion_inicial AS "posicionInicial",
 ai.estado,ai.orden_pendiente AS "ordenPendiente",ar.criterio,
 ARRAY(SELECT eh.estado FROM criterika.ejecuciones_actividad eh WHERE eh.actividad_intento_id=ai.id ORDER BY eh.numero) AS historial`;
const EXECUTION_SELECT = `SELECT e.id,e.actividad_intento_id AS "actividadIntentoId",e.intento_id AS "intentoId",
 e.numero,e.estado,e.errores,e.estado_juego AS "estadoJuego",e.iniciada_en AS "iniciadaEn",e.finalizada_en AS "finalizadaEn",
 ai.actividad_id AS "actividadId",ar.tipo,ai.posicion_inicial AS "posicionInicial",ai.estado AS "estadoActividad",
 ai.orden_pendiente AS "ordenPendiente",ar.criterio,ar.instrucciones,ar.contenido,
 ARRAY(SELECT eh.estado FROM criterika.ejecuciones_actividad eh WHERE eh.actividad_intento_id=ai.id ORDER BY eh.numero) AS historial
 FROM criterika.ejecuciones_actividad e
 JOIN criterika.actividades_intento ai ON ai.id=e.actividad_intento_id
 JOIN criterika.intentos_nivel i ON i.id=e.intento_id
 JOIN criterika.actividades_revision ar ON ar.revision_id=ai.revision_id AND ar.actividad_id=ai.actividad_id`;

function mapAttempt(row: AttemptRecord): AttemptRow {
  return {
    ...row,
    siguienteOrdenPendiente: safeInteger(row.siguienteOrdenPendiente),
  };
}
function mapActivity(row: ActivityRecord): AttemptActivityRow {
  return {
    ...row,
    ordenPendiente:
      row.ordenPendiente === null ? null : safeInteger(row.ordenPendiente),
  };
}
function mapExecution(row: ExecutionRecord): CurrentExecutionRow {
  return {
    ejecucion: {
      id: row.id,
      actividadIntentoId: row.actividadIntentoId,
      intentoId: row.intentoId,
      numero: row.numero,
      estado: row.estado,
      errores: row.errores,
      estadoJuego: row.estadoJuego,
      iniciadaEn: row.iniciadaEn,
      finalizadaEn: row.finalizadaEn,
    },
    actividad: {
      id: row.actividadIntentoId,
      actividadId: row.actividadId,
      tipo: row.tipo,
      posicionInicial: row.posicionInicial,
      estado: row.estadoActividad,
      ordenPendiente:
        row.ordenPendiente === null ? null : safeInteger(row.ordenPendiente),
      criterio: row.criterio,
      historial: row.historial,
    },
    definicion: {
      tipo: row.tipo,
      instrucciones: row.instrucciones,
      contenido: row.contenido,
      criterio: row.criterio,
    },
  };
}

/** All writes require the caller's transaction and account -> state -> attempt locks. */
@Injectable()
export class GameplayRepository {
  async findActiveAttempt(
    client: PoolClient,
    jugadorId: string,
  ): Promise<AttemptRow | null> {
    return this.readAttempt(
      client,
      "i.jugador_id=$1 AND i.estado='EN_CURSO'",
      [jugadorId],
      false,
    );
  }
  async lockActiveAttempt(
    client: PoolClient,
    jugadorId: string,
  ): Promise<AttemptRow | null> {
    return this.readAttempt(
      client,
      "i.jugador_id=$1 AND i.estado='EN_CURSO'",
      [jugadorId],
      true,
    );
  }
  async findOwnAttempt(
    client: PoolClient,
    jugadorId: string,
    intentoId: string,
  ): Promise<AttemptRow | null> {
    return this.readAttempt(
      client,
      'i.jugador_id=$1 AND i.id=$2',
      [jugadorId, intentoId],
      false,
    );
  }
  async lockOwnAttempt(
    client: PoolClient,
    jugadorId: string,
    intentoId: string,
  ): Promise<AttemptRow | null> {
    return this.readAttempt(
      client,
      'i.jugador_id=$1 AND i.id=$2',
      [jugadorId, intentoId],
      true,
    );
  }
  private async readAttempt(
    client: PoolClient,
    predicate: string,
    values: string[],
    lock: boolean,
  ): Promise<AttemptRow | null> {
    const result = await client.query<AttemptRecord>(
      ATTEMPT_SELECT + ' WHERE ' + predicate + (lock ? ' FOR UPDATE OF i' : ''),
      values,
    );
    return result.rows[0] ? mapAttempt(result.rows[0]) : null;
  }

  async findAttemptActivities(
    client: PoolClient,
    intentoId: string,
  ): Promise<AttemptActivityRow[]> {
    const result = await client.query<ActivityRecord>(
      `SELECT ${ACTIVITY_COLUMNS} FROM criterika.actividades_intento ai
       JOIN criterika.actividades_revision ar ON ar.revision_id=ai.revision_id AND ar.actividad_id=ai.actividad_id
       WHERE ai.intento_id=$1 ORDER BY ai.posicion_inicial,ai.id`,
      [intentoId],
    );
    return result.rows.map(mapActivity);
  }

  async findCurrentExecution(
    client: PoolClient,
    intentoId: string,
  ): Promise<CurrentExecutionRow | null> {
    const result = await client.query<ExecutionRecord>(
      EXECUTION_SELECT +
        " WHERE i.id=$1 AND i.estado='EN_CURSO' AND e.estado='EN_CURSO'",
      [intentoId],
    );
    return result.rows[0] ? mapExecution(result.rows[0]) : null;
  }

  /** Includes closed executions so a confirmed interaction can be replayed first. */
  async lockExecution(
    client: PoolClient,
    intentoId: string,
    ejecucionId: string,
  ): Promise<CurrentExecutionRow | null> {
    const result = await client.query<ExecutionRecord>(
      EXECUTION_SELECT + ' WHERE i.id=$1 AND e.id=$2 FOR UPDATE OF ai,e',
      [intentoId, ejecucionId],
    );
    return result.rows[0] ? mapExecution(result.rows[0]) : null;
  }

  async insertAttempt(
    client: PoolClient,
    input: InsertAttemptInput,
  ): Promise<{
    attempt: AttemptRow;
    actividades: AttemptActivityRow[];
    ejecucion: ExecutionRow;
  }> {
    const activities = [...input.actividades].sort(
      (a, b) => a.posicionInicial - b.posicionInicial,
    );
    if (
      activities.length < 3 ||
      activities.length > 6 ||
      new Set(activities.map((a) => a.actividadId)).size !== activities.length
    ) {
      throw new PersistenceInvariantError('Composición de intento no válida.');
    }
    const composition = await client.query<{ total: number }>(
      'SELECT count(*)::int AS total FROM criterika.actividades_revision WHERE revision_id=$1',
      [input.revisionId],
    );
    if (composition.rows[0].total !== activities.length) {
      throw new PersistenceInvariantError(
        'El intento requiere la revisión completa.',
      );
    }
    const attemptId = randomUUID();
    await client.query(
      `INSERT INTO criterika.intentos_nivel(id,jugador_id,nivel_id,revision_id,zona_horaria,
       iniciado_en,ultima_comunicacion_en,gemas_previstas,xp_prevista,carta_prevista_id,siguiente_orden_pendiente)
       VALUES($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,7)`,
      [
        attemptId,
        input.jugadorId,
        input.nivelId,
        input.revisionId,
        input.zonaHoraria,
        input.iniciadoEn,
        input.gemasPrevistas,
        input.xpPrevista,
        input.cartaPrevistaId,
      ],
    );
    // The existing trigger fixes unit structure; no second manual update/audit is needed.
    let firstActivityId = '';
    for (const [index, activity] of activities.entries()) {
      const created = await client.query<{ id: string }>(
        `INSERT INTO criterika.actividades_intento(intento_id,revision_id,actividad_id,posicion_inicial,estado,orden_pendiente)
         SELECT $1,revision_id,actividad_id,posicion,$4,posicion FROM criterika.actividades_revision
         WHERE revision_id=$2 AND actividad_id=$3 AND posicion=$5 RETURNING id`,
        [
          attemptId,
          input.revisionId,
          activity.actividadId,
          index === 0 ? 'EN_EJECUCION' : 'PENDIENTE',
          activity.posicionInicial,
        ],
      );
      requireOne(created.rowCount);
      if (index === 0) firstActivityId = created.rows[0].id;
    }
    const snapshot = await client.query<{ termino_id: string }>(
      `INSERT INTO criterika.terminos_intento(intento_id,revision_id,termino_id)
       SELECT $1,rt.revision_id,rt.termino_id FROM criterika.revision_terminos rt
       JOIN criterika.terminos t ON t.id=rt.termino_id
       WHERE rt.revision_id=$2 AND rt.termino_id=ANY($3::uuid[]) AND t.estado='PUBLICADO'
       RETURNING termino_id`,
      [attemptId, input.revisionId, input.terminosIds],
    );
    if (snapshot.rows.length !== new Set(input.terminosIds).size)
      throw new PersistenceInvariantError('Los términos del inicio cambiaron.');
    const execution = await this.insertExecution(client, {
      actividadIntentoId: firstActivityId,
      intentoId: attemptId,
      numero: 1,
      estadoJuego: input.primeraEjecucion.estadoJuego,
      iniciadaEn: input.iniciadoEn,
    });
    const attempt = await this.findOwnAttempt(
      client,
      input.jugadorId,
      attemptId,
    );
    if (!attempt) throw new PersistenceInvariantError();
    return {
      attempt,
      actividades: await this.findAttemptActivities(client, attemptId),
      ejecucion: execution,
    };
  }

  /** Returns false on an already terminal attempt. Only a true transition may settle its life. */
  async finishAttempt(
    client: PoolClient,
    input: FinishAttemptInput,
  ): Promise<boolean> {
    const result = await client.query(
      `UPDATE criterika.intentos_nivel SET estado=$2,motivo_finalizacion=$3,finalizado_en=$4
       WHERE id=$1 AND estado='EN_CURSO'`,
      [
        input.intentoId,
        input.estado,
        input.motivoFinalizacion,
        input.finalizadoEn,
      ],
    );
    if (result.rowCount !== 1) return false;
    if (input.estado !== 'APROBADO') {
      // Close an interrupted execution without opening a recovery or applying another life effect.
      await client.query(
        `WITH closed AS (
           UPDATE criterika.ejecuciones_actividad SET estado='FALLIDA',finalizada_en=$2
           WHERE intento_id=$1 AND estado='EN_CURSO' RETURNING actividad_intento_id,numero
         ) UPDATE criterika.actividades_intento ai
         SET estado=CASE WHEN c.numero=3 THEN 'AGOTADA' ELSE 'PENDIENTE_RECUPERACION' END,
             orden_pendiente=CASE WHEN c.numero=3 THEN NULL ELSE ai.orden_pendiente END
         FROM closed c WHERE ai.id=c.actividad_intento_id`,
        [input.intentoId, input.finalizadoEn],
      );
    }
    return true;
  }

  async touchAttempt(
    client: PoolClient,
    intentoId: string,
    ultimaComunicacionEn: Date,
  ): Promise<void> {
    const result = await client.query(
      `UPDATE criterika.intentos_nivel SET ultima_comunicacion_en=GREATEST(ultima_comunicacion_en,$2)
       WHERE id=$1 AND estado='EN_CURSO'`,
      [intentoId, ultimaComunicacionEn],
    );
    requireOne(result.rowCount);
  }

  async findInteraction(
    client: PoolClient,
    ejecucionId: string,
    claveIntencion: string,
  ): Promise<{
    huellaSolicitud: Buffer;
    evaluacion: unknown;
    registradaEn: Date;
  } | null> {
    const result = await client.query<{
      huellaSolicitud: Buffer;
      evaluacion: unknown;
      registradaEn: Date;
    }>(
      `SELECT huella_solicitud AS "huellaSolicitud",evaluacion,registrada_en AS "registradaEn"
       FROM criterika.interacciones_evaluadas WHERE ejecucion_id=$1 AND clave_intencion=$2`,
      [ejecucionId, claveIntencion],
    );
    return result.rows[0] ?? null;
  }

  async insertInteraction(
    client: PoolClient,
    input: {
      ejecucionId: string;
      claveIntencion: string;
      huellaSolicitud: Buffer;
      respuesta: unknown;
      evaluacion: unknown;
      registradaEn: Date;
    },
  ): Promise<void> {
    await client.query(
      `INSERT INTO criterika.interacciones_evaluadas(ejecucion_id,clave_intencion,huella_solicitud,respuesta,evaluacion,registrada_en)
       VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6)`,
      [
        input.ejecucionId,
        input.claveIntencion,
        input.huellaSolicitud,
        jsonObject(input.respuesta),
        jsonObject(input.evaluacion),
        input.registradaEn,
      ],
    );
  }

  async updateExecution(
    client: PoolClient,
    input: {
      ejecucionId: string;
      errores: number;
      estadoJuego: unknown;
      estado: ExecutionOutcome;
      finalizadaEn: Date | null;
    },
  ): Promise<void> {
    const result = await client.query(
      `UPDATE criterika.ejecuciones_actividad SET errores=$2,estado_juego=$3::jsonb,estado=$4,finalizada_en=$5
       WHERE id=$1 AND estado='EN_CURSO'`,
      [
        input.ejecucionId,
        input.errores,
        jsonObject(input.estadoJuego),
        input.estado,
        input.finalizadaEn,
      ],
    );
    requireOne(result.rowCount);
  }

  async updateAttemptActivity(
    client: PoolClient,
    input: {
      actividadIntentoId: string;
      estado: AttemptActivityStatus;
      ordenPendiente: number | null;
    },
  ): Promise<void> {
    const result = await client.query(
      'UPDATE criterika.actividades_intento SET estado=$2,orden_pendiente=$3 WHERE id=$1',
      [input.actividadIntentoId, input.estado, input.ordenPendiente],
    );
    requireOne(result.rowCount);
  }

  async takeNextPendingOrder(
    client: PoolClient,
    intentoId: string,
  ): Promise<number> {
    const result = await client.query<{ orden: string }>(
      `UPDATE criterika.intentos_nivel SET siguiente_orden_pendiente=siguiente_orden_pendiente+1
       WHERE id=$1 AND estado='EN_CURSO' AND siguiente_orden_pendiente<9007199254740991
       RETURNING siguiente_orden_pendiente-1 AS orden`,
      [intentoId],
    );
    requireOne(result.rowCount);
    return safeInteger(result.rows[0].orden);
  }

  async insertExecution(
    client: PoolClient,
    input: {
      actividadIntentoId: string;
      intentoId: string;
      numero: number;
      estadoJuego: unknown;
      iniciadaEn: Date;
    },
  ): Promise<ExecutionRow> {
    const active = await client.query(
      `UPDATE criterika.actividades_intento ai SET estado='EN_EJECUCION'
       FROM criterika.intentos_nivel i WHERE ai.id=$1 AND ai.intento_id=$2 AND i.id=ai.intento_id
       AND i.estado='EN_CURSO' AND ai.estado IN ('PENDIENTE','PENDIENTE_RECUPERACION','EN_EJECUCION')
       AND $3=(SELECT coalesce(max(numero),0)+1 FROM criterika.ejecuciones_actividad WHERE actividad_intento_id=ai.id)`,
      [input.actividadIntentoId, input.intentoId, input.numero],
    );
    requireOne(active.rowCount);
    const result = await client.query<ExecutionRow>(
      `INSERT INTO criterika.ejecuciones_actividad(actividad_intento_id,intento_id,numero,estado,estado_juego,iniciada_en)
       VALUES($1,$2,$3,'EN_CURSO',$4::jsonb,$5)
       RETURNING id,actividad_intento_id AS "actividadIntentoId",intento_id AS "intentoId",numero,estado,errores,
       estado_juego AS "estadoJuego",iniciada_en AS "iniciadaEn",finalizada_en AS "finalizadaEn"`,
      [
        input.actividadIntentoId,
        input.intentoId,
        input.numero,
        jsonObject(input.estadoJuego),
        input.iniciadaEn,
      ],
    );
    return result.rows[0];
  }

  async insertFirstApproval(
    client: PoolClient,
    input: {
      jugadorId: string;
      nivelId: string;
      intentoOrigenId: string;
      aprobadaEn: Date;
      gemasOtorgadas: number;
      xpOtorgada: number;
    },
  ): Promise<{ aprobacionId: string } | null> {
    const result = await client.query<{ aprobacionId: string }>(
      `INSERT INTO criterika.aprobaciones_nivel(jugador_id,nivel_id,intento_origen_id,aprobada_en,gemas_otorgadas,xp_otorgada)
       SELECT jugador_id,nivel_id,id,$4,$5,$6 FROM criterika.intentos_nivel
       WHERE jugador_id=$1 AND nivel_id=$2 AND id=$3 AND estado='APROBADO' AND gemas_previstas=$5 AND xp_prevista=$6
       ON CONFLICT (jugador_id,nivel_id) DO NOTHING RETURNING id AS "aprobacionId"`,
      [
        input.jugadorId,
        input.nivelId,
        input.intentoOrigenId,
        input.aprobadaEn,
        input.gemasOtorgadas,
        input.xpOtorgada,
      ],
    );
    if (result.rows[0]) return result.rows[0];
    const exists = await client.query(
      'SELECT id FROM criterika.aprobaciones_nivel WHERE jugador_id=$1 AND nivel_id=$2',
      [input.jugadorId, input.nivelId],
    );
    if (!exists.rowCount)
      throw new PersistenceInvariantError(
        'No se puede acreditar la aprobación.',
      );
    return null;
  }
}
