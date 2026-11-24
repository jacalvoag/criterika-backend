import type { PoolClient } from 'pg';
import type { PlayerSessionRepository } from '../registration-player-sessions.service.js';

export class PostgresPlayerSessionRepository implements PlayerSessionRepository {
  async create(
    tx: PoolClient,
    i: Parameters<PlayerSessionRepository['create']>[1],
  ): Promise<void> {
    await tx.query(
      `INSERT INTO criterika.sesiones (id,cuenta_id,refresh_hash,creada_en,expira_en)
      VALUES ($1,$2,$3,$4,$5)`,
      [
        i.sessionId,
        i.accountId,
        Buffer.from(i.refreshHash),
        i.createdAt,
        i.expiresAt,
      ],
    );
  }
  /** Lock account then session before checking whether a credential response may be recovered. */
  async canRecover(
    tx: PoolClient,
    accountId: string,
    sessionId: string,
    clock: () => Date,
  ): Promise<boolean> {
    await tx.query('SELECT id FROM criterika.cuentas WHERE id=$1 FOR UPDATE', [
      accountId,
    ]);
    await tx.query(
      'SELECT id FROM criterika.sesiones WHERE id=$1 AND cuenta_id=$2 FOR SHARE',
      [sessionId, accountId],
    );
    const at = clock();
    const { rows } = await tx.query(
      `SELECT 1 FROM criterika.sesiones s JOIN criterika.cuentas c ON c.id=s.cuenta_id
      WHERE s.id=$1 AND c.id=$2 AND c.rol='JUGADOR' AND c.situacion_operativa='HABILITADA'
      AND (c.fecha_nacimiento+interval '18 years')::date<=($3::timestamptz AT TIME ZONE 'UTC')::date
      AND NOT EXISTS (SELECT 1 FROM criterika.restricciones_tratamiento r WHERE r.jugador_id=c.id
        AND r.levantada_en IS NULL AND r.aplicada_en<=$3)
      AND s.revocada_en IS NULL AND s.expira_en>$3
      AND NOT EXISTS (SELECT 1 FROM criterika.sanciones x WHERE x.jugador_id=c.id
        AND x.levantada_en IS NULL AND x.inicio<=$3 AND (x.vence_en IS NULL OR x.vence_en>$3))`,
      [sessionId, accountId, at],
    );
    return rows.length === 1;
  }
}
