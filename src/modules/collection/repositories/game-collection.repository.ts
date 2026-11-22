import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { PersistenceInvariantError } from '../../../database/persistence-values.js';

@Injectable()
export class GameCollectionRepository {
  async grantCard(
    client: PoolClient,
    input: {
      jugadorId: string;
      cartaId: string;
      aprobacionOrigenId: string;
      obtenidaEn: Date;
    },
  ): Promise<void> {
    const origin = await client.query(
      `SELECT a.id FROM criterika.aprobaciones_nivel a JOIN criterika.intentos_nivel i ON i.id=a.intento_origen_id
       WHERE a.id=$1 AND a.jugador_id=$2 AND i.carta_prevista_id=$3 AND i.estado='APROBADO'`,
      [input.aprobacionOrigenId, input.jugadorId, input.cartaId],
    );
    if (!origin.rowCount)
      throw new PersistenceInvariantError(
        'La carta no corresponde al derecho fijado.',
      );
    await client.query(
      `INSERT INTO criterika.cartas_obtenidas(jugador_id,carta_id,aprobacion_origen_id,obtenida_en)
       VALUES($1,$2,$3,$4) ON CONFLICT (jugador_id,carta_id) DO NOTHING`,
      [
        input.jugadorId,
        input.cartaId,
        input.aprobacionOrigenId,
        input.obtenidaEn,
      ],
    );
  }
}
