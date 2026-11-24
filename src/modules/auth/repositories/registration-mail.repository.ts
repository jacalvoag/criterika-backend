import type { PoolClient } from 'pg';

/** Session advisory lease is held by the worker, without an open SQL transaction during SMTP. */
export class PostgresRegistrationMailRepository {
  async candidates(
    client: PoolClient,
    limit: number,
  ): Promise<{ id: string; registrationId: string }[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new RangeError('Límite de envíos inválido.');
    const { rows } = await client.query<{ id: string; registro_id: string }>(
      `SELECT d.id,d.registro_id FROM criterika.desafios_verificacion d
   WHERE d.finalidad='REGISTRO' AND d.clase='CODIGO' AND d.estado_envio IN ('PENDIENTE','ERROR')
   AND d.mensaje_envio_cifrado IS NOT NULL ORDER BY d.creado_en,d.id LIMIT $1`,
      [limit],
    );
    return rows.map((r) => ({ id: r.id, registrationId: r.registro_id }));
  }
  async load(client: PoolClient, id: string, at: Date) {
    await client.query(
      `UPDATE criterika.desafios_verificacion SET mensaje_envio_cifrado=NULL
    WHERE id=$1 AND finalidad='REGISTRO' AND (usado_en IS NOT NULL OR expira_en<=$2)`,
      [id, at],
    );
    const { rows } = await client.query<{
      id: string;
      correo_destino: string;
      mensaje_envio_cifrado: Buffer;
      expira_en: Date;
    }>(
      `SELECT d.id,d.correo_destino,d.mensaje_envio_cifrado,d.expira_en
    FROM criterika.desafios_verificacion d JOIN criterika.registros_pendientes r ON r.id=d.registro_id
    WHERE d.id=$1 AND d.finalidad='REGISTRO' AND d.clase='CODIGO' AND d.usado_en IS NULL AND d.intentos_fallidos<5
    AND d.expira_en>$2 AND r.expira_en>$2 AND r.cuenta_creada_id IS NULL
    AND d.estado_envio IN ('PENDIENTE','ERROR') AND d.mensaje_envio_cifrado IS NOT NULL`,
      [id, at],
    );
    return rows[0] ?? null;
  }
  async sent(client: PoolClient, id: string): Promise<void> {
    await client.query(
      `UPDATE criterika.desafios_verificacion SET estado_envio='ENVIADO',mensaje_envio_cifrado=NULL WHERE id=$1 AND finalidad='REGISTRO'`,
      [id],
    );
  }
  async failed(client: PoolClient, id: string): Promise<void> {
    await client.query(
      `UPDATE criterika.desafios_verificacion SET estado_envio='ERROR' WHERE id=$1 AND finalidad='REGISTRO' AND mensaje_envio_cifrado IS NOT NULL`,
      [id],
    );
  }
}
