import { Injectable } from '@nestjs/common';
import { isIP } from 'node:net';
import type { PoolClient } from 'pg';
import { PersistenceInvariantError } from '../../../database/persistence-values.js';
import { parseAcceptanceInput } from '../acceptance-input.js';
import { RegistrationLegalService } from '../registration-legal.service.js';

export interface LegalAcceptanceSnapshot {
  id: string;
  usuarioId: string;
  aceptadaEn: Date;
  ip: string;
  terminosVersionId: string;
  avisoVersionId: string;
  aceptaTerminos: true;
  reconoceAvisoPresentado: true;
  consienteFinalidadesIds: string[];
}
/** Internal anchor, not a public cursor. Bind/protect the HTTP cursor to its owner. */
export interface AcceptancePosition {
  acceptanceId: string;
}
export class AcceptancePositionError extends Error {
  constructor() {
    super('Posición de aceptaciones inválida.');
    this.name = 'AcceptancePositionError';
  }
}
const FIELDS = `a.id,a.cuenta_id AS "usuarioId",a.aceptada_en AS "aceptadaEn",host(a.ip) AS ip,
  a.terminos_version_id AS "terminosVersionId",a.aviso_version_id AS "avisoVersionId",
  a.acepta_terminos AS "aceptaTerminos",a.reconoce_aviso_presentado AS "reconoceAvisoPresentado",
  ARRAY(SELECT f.finalidad_codigo FROM criterika.aceptacion_finalidades f
    WHERE f.aceptacion_id=a.id ORDER BY f.finalidad_codigo COLLATE "C") AS "consienteFinalidadesIds"`;
const SOURCE = `FROM criterika.aceptaciones_legales a
  JOIN criterika.cuentas c ON c.id=a.cuenta_id AND c.rol='JUGADOR'`;

/** Reuses existing legal selection/recording; does not overwrite evidence or lift privacy restrictions. */
@Injectable()
export class PostgresLegalAcceptanceRepository {
  constructor(private readonly legal: RegistrationLegalService) {}

  /** Trusted session ID only. Use TransactionRunner.read for anchor and page in one snapshot. */
  async listOwned(
    tx: PoolClient,
    authenticatedPlayerId: string,
    limit = 20,
    after?: AcceptancePosition,
  ) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new PersistenceInvariantError('Límite de aceptaciones inválido.');
    let anchor: { at: string; id: string } | undefined;
    if (after) {
      const { rows } = await tx.query<{ at: string; id: string }>(
        `SELECT a.aceptada_en::text AS at,a.id ${SOURCE} WHERE a.cuenta_id=$1 AND a.id=$2`,
        [authenticatedPlayerId, after.acceptanceId],
      );
      anchor = rows[0];
      if (!anchor) throw new AcceptancePositionError();
    }
    const { rows } = await tx.query<LegalAcceptanceSnapshot>(
      `SELECT ${FIELDS} ${SOURCE} WHERE a.cuenta_id=$1
       AND ($2::timestamptz IS NULL OR (a.aceptada_en,a.id)<($2::timestamptz,$3::uuid))
       ORDER BY a.aceptada_en DESC,a.id DESC LIMIT $4`,
      [
        authenticatedPlayerId,
        anchor?.at ?? null,
        anchor?.id ?? null,
        limit + 1,
      ],
    );
    const items = rows.slice(0, limit);
    return {
      items,
      nextPosition:
        rows.length > limit && items.length
          ? { acceptanceId: items[items.length - 1].id }
          : null,
    };
  }

  /** IP and clock come from the server, independently of the untrusted acceptance body. */
  async createOwned(
    tx: PoolClient,
    authenticatedPlayerId: string,
    input: unknown,
    trustedIp: string,
    clock: () => Date = () => new Date(),
  ) {
    const parsed = parseAcceptanceInput(input);
    if (!parsed.ok) return parsed;
    if (typeof trustedIp !== 'string' || !isIP(trustedIp))
      throw new PersistenceInvariantError('IP de aceptación inválida.');
    const { rows: context } = await tx.query<{ owned: boolean }>(
      `SELECT current_setting('criterika.actor_tipo',true)='JUGADOR'
       AND NULLIF(current_setting('criterika.actor_id',true),'')::uuid=$1::uuid AS owned`,
      [authenticatedPlayerId],
    );
    if (context[0]?.owned !== true)
      throw new PersistenceInvariantError(
        'Contexto de aceptación no autorizado.',
      );
    const account = await tx.query(
      `SELECT id FROM criterika.cuentas
      WHERE id=$1 AND rol='JUGADOR' FOR UPDATE`,
      [authenticatedPlayerId],
    );
    if (!account.rowCount)
      return { ok: false, reason: 'ACCOUNT_UNAVAILABLE' } as const;
    const selection = {
      termsVersionId: parsed.value.terminosVersionId,
      privacyVersionId: parsed.value.avisoVersionId,
      purposeCodes: parsed.value.consienteFinalidadesIds,
    };
    const checked = await this.legal.assertCurrentSelection(tx, selection);
    if (!checked.ok) return checked;
    // Capture the original server instant only after all potentially waiting locks.
    const acceptedAt = clock();
    if (!(acceptedAt instanceof Date) || !Number.isFinite(acceptedAt.getTime()))
      throw new PersistenceInvariantError('Instante de aceptación inválido.');
    const id = await this.legal.recordOriginalAcceptance(
      tx,
      authenticatedPlayerId,
      {
        ...selection,
        acceptedAt: new Date(acceptedAt.getTime()),
        ip: trustedIp,
      },
    );
    const { rows } = await tx.query<LegalAcceptanceSnapshot>(
      `SELECT ${FIELDS} ${SOURCE} WHERE a.id=$1 AND a.cuenta_id=$2`,
      [id, authenticatedPlayerId],
    );
    if (!rows[0])
      throw new PersistenceInvariantError(
        'No se pudo recuperar la aceptación creada.',
      );
    return { ok: true, value: rows[0] } as const;
  }
}
