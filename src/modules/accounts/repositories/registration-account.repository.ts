import type { PoolClient } from 'pg';
import type {
  AccountRegistrationRepository,
  VerifiedPlayerInput,
} from '../registration-account.service.js';

export class PostgresAccountRegistrationRepository implements AccountRegistrationRepository {
  async createVerifiedPlayer(tx: PoolClient, i: VerifiedPlayerInput) {
    const { rows } = await tx.query<{
      id: string;
      creada_en: Date;
      version: string;
    }>(
      `INSERT INTO criterika.cuentas
      (id,rol,correo_normalizado,correo_presentacion,contrasena_hash,nombre,apellidos,fecha_nacimiento,
       correo_confirmado_en,creada_en,ultimo_uso_personal_en)
      VALUES ($1,'JUGADOR',$2,$2,$3,$4,$5,$6::date,$7,$7,$7)
      ON CONFLICT (correo_normalizado) DO NOTHING RETURNING id,creada_en,version`,
      [
        i.accountId,
        i.normalizedEmail,
        i.passwordHash,
        i.name,
        i.surnames,
        i.birthDate,
        i.verifiedAt,
      ],
    );
    const r = rows[0];
    if (!r) return { kind: 'email_in_use' } as const;
    await tx.query(
      `INSERT INTO criterika.estados_jugador
      (cuenta_id,gemas_saldo,xp_total,vidas_totales,proxima_regeneracion_en,racha_ultimo_dia,racha_contador_hito,racha_zona)
      VALUES ($1,0,0,5,NULL,NULL,0,'Etc/UTC')`,
      [r.id],
    );
    return {
      kind: 'created',
      accountId: r.id,
      createdAt: r.creada_en,
      version: BigInt(r.version),
    } as const;
  }
}
