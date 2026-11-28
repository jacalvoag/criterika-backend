import type { PoolClient } from 'pg';
import { PersistenceInvariantError } from '../../../database/persistence-values.js';
import {
  EVOLUTION_COSTS,
  type EvolutionStage,
} from '../../economy/purchases.js';
export interface CardRow {
  id: string;
  unidadId: string;
  nombre: string | null;
  descripcion: string | null;
  obtenida: boolean;
  imagenBaseMediaId: string | null;
  etapaActual: number;
  comprable: boolean;
  evoluciones: {
    etapa: EvolutionStage;
    obtenida: boolean;
    habilitada: boolean;
    imagenMediaId: string | null;
  }[];
}
export const CARD_FIELDS = `c.estado='PUBLICADO' AS comprable,c.id,c.unidad_id AS "unidadId",c.nombre_publicado AS nombre,c.descripcion_publicada AS descripcion,
  o.id IS NOT NULL AS obtenida,CASE WHEN o.id IS NOT NULL THEN c.imagen_base_publicada_id END AS "imagenBaseMediaId",
  COALESCE((SELECT max(e.numero_etapa) FROM criterika.evoluciones_obtenidas e WHERE e.jugador_id=$1 AND e.carta_id=c.id),0) AS "etapaActual",
  COALESCE((SELECT jsonb_agg(jsonb_build_object('etapa',s.numero,'obtenida',e.id IS NOT NULL,'habilitada',s.habilitada,
    'imagenMediaId',CASE WHEN e.id IS NOT NULL THEN s.imagen_publicada_id END) ORDER BY s.numero)
    FROM criterika.etapas_carta s LEFT JOIN criterika.evoluciones_obtenidas e ON e.carta_id=s.carta_id AND e.numero_etapa=s.numero AND e.jugador_id=$1 WHERE s.carta_id=c.id),'[]'::jsonb) AS evoluciones`;
export const CARD_SOURCE = `FROM criterika.cartas c LEFT JOIN criterika.cartas_obtenidas o ON o.carta_id=c.id AND o.jugador_id=$1
 WHERE (c.estado='PUBLICADO' OR o.id IS NOT NULL) AND EXISTS(SELECT 1 FROM criterika.cuentas a WHERE a.id=$1 AND a.rol='JUGADOR')`;
export function projectCard(row: CardRow) {
  if (!row.nombre || !row.descripcion || row.evoluciones.length !== 3)
    throw new PersistenceInvariantError('Carta publicada incompleta.');
  const { comprable: _comprable, ...card } = row;
  return {
    ...card,
    evoluciones: row.evoluciones.map((e) => ({
      etapa: e.etapa,
      costoGemas: EVOLUTION_COSTS[e.etapa],
      obtenida: e.obtenida,
      disponible:
        row.comprable &&
        !e.obtenida &&
        row.obtenida &&
        e.habilitada &&
        e.etapa === row.etapaActual + 1,
      imagenMediaId: e.imagenMediaId,
    })),
  };
}
export async function readCollectionCard(
  tx: PoolClient,
  playerId: string,
  id: string,
) {
  const { rows } = await tx.query<CardRow>(
    `SELECT ${CARD_FIELDS} ${CARD_SOURCE} AND c.id=$2`,
    [playerId, id],
  );
  return rows[0] ? projectCard(rows[0]) : null;
}
