import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { PathUnitInput } from '../learning-path.types.js';
import type { ContentStatus, LevelType } from '../unit.types.js';
import type { MinigameType } from '../../minigames/minigame-type.js';

export interface PublishedActivityRow {
  actividadId: string;
  posicion: number;
  tipo: MinigameType;
  instrucciones: string;
  contenido: unknown;
  criterio: unknown;
}
export interface LevelPreviewRow {
  nivelId: string;
  unidadId: string;
  revisionId: string;
  nombrePublicado: string;
  orden: number;
  tipo: LevelType;
  estado: Exclude<ContentStatus, 'BORRADOR'>;
  estadoUnidad: ContentStatus;
  carta: { id: string; estado: ContentStatus } | null;
  actividades: Omit<PublishedActivityRow, 'contenido'>[];
  terminosIds: string[];
}
interface PathRecord {
  unidadId: string;
  unidadNombre: string;
  descripcion: string;
  unidadOrden: number;
  unidadEstado: ContentStatus;
  estadoCarta: ContentStatus | null;
  nivelId: string | null;
  nivelNombre: string;
  nivelOrden: number;
  tipo: LevelType;
  nivelEstado: ContentStatus;
  completado: boolean;
}

/** SQL only; publication/access/availability rules remain in public content services. */
@Injectable()
export class GameContentRepository {
  async findLearningPath(
    client: PoolClient,
    jugadorId: string,
  ): Promise<PathUnitInput[]> {
    const result = await client.query<PathRecord>(
      `SELECT u.id AS "unidadId", u.nombre AS "unidadNombre", u.descripcion,
        u.orden AS "unidadOrden", u.estado AS "unidadEstado", c.estado AS "estadoCarta",
        n.id AS "nivelId", r.nombre_publicado AS "nivelNombre", n.orden AS "nivelOrden",
        n.tipo, n.estado AS "nivelEstado",
        EXISTS(SELECT 1 FROM criterika.aprobaciones_nivel p WHERE p.jugador_id=$1 AND p.nivel_id=n.id) AS completado
       FROM criterika.unidades u
       LEFT JOIN criterika.cartas c ON c.unidad_id=u.id
       LEFT JOIN criterika.niveles n ON n.unidad_id=u.id AND n.estado<>'BORRADOR'
       LEFT JOIN criterika.revisiones_nivel r ON r.id=n.revision_publicada_id
       WHERE u.estado<>'BORRADOR' ORDER BY u.orden,u.id,n.orden,n.id`,
      [jugadorId],
    );
    const units = new Map<string, PathUnitInput>();
    for (const row of result.rows) {
      let unit = units.get(row.unidadId);
      if (!unit) {
        unit = {
          id: row.unidadId,
          nombre: row.unidadNombre,
          descripcion: row.descripcion,
          orden: row.unidadOrden,
          estado: row.unidadEstado,
          estadoCarta: row.estadoCarta,
          niveles: [],
        };
        units.set(unit.id, unit);
      }
      if (row.nivelId !== null)
        unit.niveles.push({
          id: row.nivelId,
          nombre: row.nivelNombre,
          orden: row.nivelOrden,
          tipo: row.tipo,
          estado: row.nivelEstado,
          completado: row.completado,
        });
    }
    return [...units.values()];
  }

  async findPublishedLevelPreview(
    client: PoolClient,
    nivelId: string,
  ): Promise<LevelPreviewRow | null> {
    const result = await client.query<
      Omit<LevelPreviewRow, 'actividades' | 'terminosIds'>
    >(
      `SELECT n.id AS "nivelId", n.unidad_id AS "unidadId", r.id AS "revisionId",
        r.nombre_publicado AS "nombrePublicado", n.orden,n.tipo,n.estado,u.estado AS "estadoUnidad",
        CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('id',c.id,'estado',c.estado) END AS carta
       FROM criterika.niveles n JOIN criterika.unidades u ON u.id=n.unidad_id
       JOIN criterika.revisiones_nivel r ON r.id=n.revision_publicada_id
       LEFT JOIN criterika.cartas c ON c.unidad_id=u.id
       WHERE n.id=$1 AND n.estado<>'BORRADOR' AND u.estado<>'BORRADOR'`,
      [nivelId],
    );
    const level = result.rows[0];
    if (!level) return null;
    // Deliberately omit contenido: this query is safe input for a preview projector.
    const activities = await client.query<
      Omit<PublishedActivityRow, 'contenido'>
    >(
      `SELECT actividad_id AS "actividadId", posicion,tipo,instrucciones,criterio
       FROM criterika.actividades_revision WHERE revision_id=$1 ORDER BY posicion,actividad_id`,
      [level.revisionId],
    );
    return {
      ...level,
      actividades: activities.rows,
      terminosIds: await this.findPublishedTermIds(client, level.revisionId),
    };
  }

  async hasFirstApproval(
    client: PoolClient,
    jugadorId: string,
    nivelId: string,
  ): Promise<boolean> {
    const result = await client.query<{ exists: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM criterika.aprobaciones_nivel WHERE jugador_id=$1 AND nivel_id=$2)',
      [jugadorId, nivelId],
    );
    return result.rows[0].exists;
  }

  /** Call after account/state/previous-attempt locks; matches publication's unit -> level order. */
  async lockLevelForStart(
    client: PoolClient,
    nivelId: string,
  ): Promise<LevelPreviewRow | null> {
    const lookup = await client.query<{ unidad_id: string }>(
      'SELECT unidad_id FROM criterika.niveles WHERE id=$1',
      [nivelId],
    );
    if (!lookup.rows[0]) return null;
    const unit = await client.query(
      'SELECT id FROM criterika.unidades WHERE id=$1 FOR UPDATE',
      [lookup.rows[0].unidad_id],
    );
    if (!unit.rowCount) return null;
    const level = await client.query(
      'SELECT id FROM criterika.niveles WHERE id=$1 AND unidad_id=$2 FOR UPDATE',
      [nivelId, lookup.rows[0].unidad_id],
    );
    return level.rowCount
      ? this.findPublishedLevelPreview(client, nivelId)
      : null;
  }

  async findPublishedActivities(
    client: PoolClient,
    revisionId: string,
  ): Promise<PublishedActivityRow[]> {
    const result = await client.query<PublishedActivityRow>(
      `SELECT actividad_id AS "actividadId",posicion,tipo,instrucciones,contenido,criterio
       FROM criterika.actividades_revision WHERE revision_id=$1 ORDER BY posicion,actividad_id`,
      [revisionId],
    );
    return result.rows;
  }

  async findPublishedTermIds(
    client: PoolClient,
    revisionId: string,
  ): Promise<string[]> {
    const result = await client.query<{ termino_id: string }>(
      `SELECT rt.termino_id FROM criterika.revision_terminos rt
       JOIN criterika.terminos t ON t.id=rt.termino_id
       WHERE rt.revision_id=$1 AND t.estado='PUBLICADO' ORDER BY rt.termino_id`,
      [revisionId],
    );
    return result.rows.map((row) => row.termino_id);
  }
}
