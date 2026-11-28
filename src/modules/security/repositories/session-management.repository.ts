import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  boundedLimit,
  requireHumanContext,
  serverInstant,
} from '../../../database/persistence-checks.js';
import { PersistenceInvariantError } from '../../../database/persistence-values.js';
export interface SessionPosition {
  sessionId: string;
}
interface SessionRow {
  id: string;
  rol: 'JUGADOR';
  creadaEn: Date;
  expiraEn: Date;
  esActual: boolean;
}
@Injectable()
export class PostgresSessionManagementRepository {
  /** Only active player sessions. Caller supplies its verified current session and protects cursors. */
  async listOwned(
    tx: PoolClient,
    accountId: string,
    currentSessionId: string,
    at: Date,
    limit = 20,
    after?: SessionPosition,
  ) {
    boundedLimit(limit);
    const now = serverInstant(() => at);
    const live = await tx.query(
      `SELECT s.id FROM criterika.sesiones s JOIN criterika.cuentas c ON c.id=s.cuenta_id
      WHERE s.id=$1 AND c.id=$2 AND c.rol='JUGADOR' AND c.situacion_operativa='HABILITADA'
      AND s.revocada_en IS NULL AND s.creada_en<=$3 AND s.expira_en>$3`,
      [currentSessionId, accountId, now],
    );
    if (!live.rowCount)
      throw new PersistenceInvariantError('Sesión actual no disponible.');
    let anchor: { stamp: string; id: string } | undefined;
    if (after) {
      const result = await tx.query<{ stamp: string; id: string }>(
        `SELECT creada_en::text AS stamp,id FROM criterika.sesiones
      WHERE id=$1 AND cuenta_id=$2`,
        [after.sessionId, accountId],
      );
      anchor = result.rows[0];
      if (!anchor)
        throw new PersistenceInvariantError('Posición de sesiones inválida.');
    }
    const { rows } = await tx.query<SessionRow>(
      `SELECT s.id,c.rol,s.creada_en AS "creadaEn",s.expira_en AS "expiraEn",s.id=$2::uuid AS "esActual"
      FROM criterika.sesiones s JOIN criterika.cuentas c ON c.id=s.cuenta_id WHERE s.cuenta_id=$1
      AND s.revocada_en IS NULL AND s.creada_en<=$3 AND s.expira_en>$3
      AND ($4::timestamptz IS NULL OR (s.creada_en,s.id)<($4::timestamptz,$5::uuid))
      ORDER BY s.creada_en DESC,s.id DESC LIMIT $6`,
      [
        accountId,
        currentSessionId,
        now,
        anchor?.stamp ?? null,
        anchor?.id ?? null,
        limit + 1,
      ],
    );
    const items = rows.slice(0, limit);
    return {
      items,
      nextPosition:
        rows.length > limit ? { sessionId: items[items.length - 1].id } : null,
    };
  }
  /** Argon2 verification happens before this call; compare its observed stored hash under the account lock. */
  async confirmOwned(
    tx: PoolClient,
    accountId: string,
    sessionId: string,
    observedHash: string,
    clock: () => Date = () => new Date(),
  ) {
    if (typeof observedHash !== 'string' || !observedHash)
      throw new PersistenceInvariantError('Credencial observada inválida.');
    await requireHumanContext(tx, accountId);
    const account = await tx.query(
      `SELECT id FROM criterika.cuentas WHERE id=$1 AND contrasena_hash=$2
      AND situacion_operativa='HABILITADA' FOR UPDATE`,
      [accountId, observedHash],
    );
    if (!account.rowCount) return false;
    await tx.query(
      'SELECT id FROM criterika.sesiones WHERE cuenta_id=$1 AND id=$2 FOR UPDATE',
      [accountId, sessionId],
    );
    const now = serverInstant(clock);
    const { rowCount } = await tx.query(
      `UPDATE criterika.sesiones SET identidad_confirmada_en=$3
      WHERE cuenta_id=$1 AND id=$2 AND revocada_en IS NULL AND creada_en<=$3 AND expira_en>$3`,
      [accountId, sessionId, now],
    );
    return rowCount === 1;
  }
  async hasRecentConfirmation(
    tx: PoolClient,
    accountId: string,
    sessionId: string,
    at: Date,
  ) {
    const now = serverInstant(() => at);
    const { rowCount } = await tx.query(
      `SELECT s.id FROM criterika.sesiones s JOIN criterika.cuentas c ON c.id=s.cuenta_id
      WHERE c.id=$1 AND s.id=$2 AND c.situacion_operativa='HABILITADA' AND s.revocada_en IS NULL
      AND s.creada_en<=$3 AND s.expira_en>$3 AND s.identidad_confirmada_en<=$3
      AND s.identidad_confirmada_en>$3::timestamptz-interval '5 minutes'`,
      [accountId, sessionId, now],
    );
    return rowCount === 1;
  }
}
