import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { PersistenceInvariantError } from '../../../database/persistence-values.js';

@Injectable()
export class GameDictionaryRepository {
  async grantAttemptTerms(
    client: PoolClient,
    input: {
      jugadorId: string;
      intentoId: string;
      aprobacionOrigenId: string;
      desbloqueadosEn: Date;
    },
  ): Promise<string[]> {
    const origin = await client.query(
      `SELECT id FROM criterika.aprobaciones_nivel WHERE id=$1 AND jugador_id=$2 AND intento_origen_id=$3`,
      [input.aprobacionOrigenId, input.jugadorId, input.intentoId],
    );
    if (!origin.rowCount)
      throw new PersistenceInvariantError(
        'Los términos no corresponden a la aprobación.',
      );
    const result = await client.query<{ termino_id: string }>(
      `INSERT INTO criterika.terminos_desbloqueados(jugador_id,termino_id,aprobacion_origen_id,desbloqueado_en)
       SELECT $1,termino_id,$3,$4 FROM criterika.terminos_intento WHERE intento_id=$2
       ON CONFLICT (jugador_id,termino_id) DO NOTHING RETURNING termino_id`,
      [
        input.jugadorId,
        input.intentoId,
        input.aprobacionOrigenId,
        input.desbloqueadosEn,
      ],
    );
    return result.rows.map((row) => row.termino_id).sort();
  }
}
