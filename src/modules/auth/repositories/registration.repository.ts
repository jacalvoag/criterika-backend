import type { PoolClient } from 'pg';
import type { RegistrationRepository } from '../registration-commands.js';
import {
  requireOne,
  PersistenceInvariantError,
} from '../../../database/persistence-values.js';

type Input<K extends keyof RegistrationRepository> = Parameters<
  RegistrationRepository[K]
>[1];

export class PostgresRegistrationRepository implements RegistrationRepository {
  async createPending(
    tx: PoolClient,
    i: Input<'createPending'>,
  ): Promise<void> {
    await tx.query(
      `INSERT INTO criterika.registros_pendientes
      (id,correo_normalizado,nombre,apellidos,fecha_nacimiento,contrasena_hash,
       terminos_version_id,aviso_version_id,finalidades_codigos,aceptada_en,ip_aceptacion,creado_en,expira_en)
      VALUES ($1,$2,$3,$4,$5::date,$6,$7,$8,$9,$10,$11::inet,$12,$13)`,
      [
        i.registrationId,
        i.normalizedEmail,
        i.name,
        i.surnames,
        i.birthDate,
        i.passwordHash,
        i.acceptance.termsVersionId,
        i.acceptance.privacyVersionId,
        [...i.acceptance.purposeCodes],
        i.acceptance.acceptedAt,
        i.acceptance.ip,
        i.createdAt,
        i.expiresAt,
      ],
    );
  }
  async createChallenge(
    tx: PoolClient,
    i: Input<'createChallenge'>,
  ): Promise<void> {
    await tx.query(
      `INSERT INTO criterika.desafios_verificacion
      (id,clase,finalidad,registro_id,correo_destino,verificador_hash,mensaje_envio_cifrado,
       creado_en,expira_en,reenvio_disponible_en,estado_envio)
      VALUES ($1,'CODIGO','REGISTRO',$2,$3,$4,$5,$6,$7,$8,'PENDIENTE')`,
      [
        i.challengeId,
        i.registrationId,
        i.destinationEmail,
        Buffer.from(i.verifierHash),
        Buffer.from(i.encryptedMail),
        i.createdAt,
        i.expiresAt,
        i.resendAvailableAt,
      ],
    );
  }
  async findPendingForUpdate(tx: PoolClient, id: string) {
    await tx.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('criterika:registration-mail:' || $1::text,0))",
      [id],
    );
    const { rows } = await tx.query(
      `SELECT id,correo_normalizado,nombre,apellidos,
      fecha_nacimiento::text,contrasena_hash,terminos_version_id,aviso_version_id,
      finalidades_codigos,aceptada_en,host(ip_aceptacion) AS ip,creado_en,expira_en,cuenta_creada_id
      FROM criterika.registros_pendientes WHERE id=$1 FOR UPDATE`,
      [id],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      registrationId: r.id as string,
      normalizedEmail: r.correo_normalizado as string,
      name: r.nombre as string,
      surnames: r.apellidos as string,
      birthDate: r.fecha_nacimiento as string,
      passwordHash: r.contrasena_hash as string,
      createdAt: r.creado_en as Date,
      expiresAt: r.expira_en as Date,
      completedAccountId: r.cuenta_creada_id as string | null,
      acceptance: {
        termsVersionId: r.terminos_version_id as string,
        privacyVersionId: r.aviso_version_id as string,
        purposeCodes: r.finalidades_codigos as string[],
        acceptedAt: r.aceptada_en as Date,
        ip: r.ip as string,
      },
    };
  }
  async findLatestChallengeForUpdate(tx: PoolClient, id: string) {
    const { rows } = await tx.query(
      `SELECT * FROM criterika.desafios_verificacion
      WHERE registro_id=$1 AND finalidad='REGISTRO' AND clase='CODIGO'
      ORDER BY creado_en DESC,id DESC LIMIT 1 FOR UPDATE`,
      [id],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      challengeId: r.id as string,
      registrationId: r.registro_id as string,
      destinationEmail: r.correo_destino as string,
      verifierHash: r.verificador_hash as Buffer,
      createdAt: r.creado_en as Date,
      expiresAt: r.expira_en as Date,
      resendAvailableAt: r.reenvio_disponible_en as Date,
      failedAttempts: r.intentos_fallidos as number,
      usedAt: r.usado_en as Date | null,
    };
  }
  async invalidatePreviousCodes(
    tx: PoolClient,
    id: string,
    at: Date,
  ): Promise<void> {
    await tx.query(
      `UPDATE criterika.desafios_verificacion
      SET usado_en=$2,mensaje_envio_cifrado=NULL
      WHERE registro_id=$1 AND finalidad='REGISTRO' AND clase='CODIGO' AND usado_en IS NULL`,
      [id, at],
    );
  }
  async incrementFailedAttempts(tx: PoolClient, id: string): Promise<number> {
    const { rows } = await tx.query<{ intentos_fallidos: number }>(
      `UPDATE criterika.desafios_verificacion
      SET intentos_fallidos=LEAST(intentos_fallidos+1,5)
      WHERE id=$1 AND finalidad='REGISTRO' AND clase='CODIGO' AND usado_en IS NULL
      RETURNING intentos_fallidos`,
      [id],
    );
    if (!rows[0]) throw new PersistenceInvariantError();
    return rows[0].intentos_fallidos;
  }
  async consumeChallenge(tx: PoolClient, id: string, at: Date): Promise<void> {
    const r = await tx.query(
      `UPDATE criterika.desafios_verificacion SET usado_en=$2,mensaje_envio_cifrado=NULL
      WHERE id=$1 AND finalidad='REGISTRO' AND clase='CODIGO' AND usado_en IS NULL AND expira_en>$2`,
      [id, at],
    );
    requireOne(r.rowCount);
  }
  async markCompleted(
    tx: PoolClient,
    id: string,
    account: string,
  ): Promise<void> {
    const r = await tx.query(
      `UPDATE criterika.registros_pendientes SET cuenta_creada_id=$2
      WHERE id=$1 AND cuenta_creada_id IS NULL`,
      [id, account],
    );
    requireOne(r.rowCount);
  }
}
