import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { PersistenceInvariantError } from '../../../database/persistence-values.js';

export interface ActivePlayerSanction {
  tipo: 'TEMPORAL' | 'BLOQUEO';
  inicio: Date;
  venceEn: Date | null;
}
/** Internal facts for accounts, not an authorization decision or a public DTO. */
export interface PlayerAccountStateSnapshot {
  cuentaId: string;
  evaluadaEn: Date;
  sanciones: ActivePlayerSanction[];
  finalidadesRestringidas: string[];
}

/** Minimal, read-only access to moderation/privacy facts without importing their modules. */
@Injectable()
export class PostgresPlayerAccountStateRepository {
  /**
   * Use the identity resolved by trusted session/account code and a server-owned instant.
   * Call with TransactionRunner.read so all queries, including the profile, share a snapshot.
   */
  async getOwned(
    tx: PoolClient,
    authenticatedPlayerId: string,
    at: Date,
  ): Promise<PlayerAccountStateSnapshot | null> {
    if (!(at instanceof Date) || !Number.isFinite(at.getTime()))
      throw new PersistenceInvariantError(
        'Instante de estado de cuenta inválido.',
      );
    const instant = new Date(at.getTime());
    const account = await tx.query(
      `SELECT id FROM criterika.cuentas WHERE id=$1 AND rol='JUGADOR'`,
      [authenticatedPlayerId],
    );
    if (!account.rowCount) return null;
    const sanctions = await tx.query<ActivePlayerSanction>(
      `SELECT tipo,inicio,vence_en AS "venceEn" FROM criterika.sanciones
       WHERE jugador_id=$1 AND inicio<=$2
         AND (vence_en IS NULL OR vence_en>$2)
         AND (levantada_en IS NULL OR levantada_en>$2)
       ORDER BY inicio,id`,
      [authenticatedPlayerId, instant],
    );
    const restrictions = await tx.query<{ finalidadCodigo: string }>(
      `SELECT DISTINCT finalidad_codigo COLLATE "C" AS "finalidadCodigo"
       FROM criterika.restricciones_tratamiento
       WHERE jugador_id=$1 AND aplicada_en<=$2
         AND (levantada_en IS NULL OR levantada_en>$2)
       ORDER BY "finalidadCodigo"`,
      [authenticatedPlayerId, instant],
    );
    return {
      cuentaId: authenticatedPlayerId,
      evaluadaEn: instant,
      sanciones: sanctions.rows,
      finalidadesRestringidas: restrictions.rows.map(
        (row) => row.finalidadCodigo,
      ),
    };
  }
}
