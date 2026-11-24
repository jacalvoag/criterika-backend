import {
  argon2,
  randomBytes,
  createPrivateKey,
  createPublicKey,
  sign,
  timingSafeEqual,
  type KeyObject,
} from 'node:crypto';
import type { RegistrationAccessSigner } from '../../modules/security/registration-player-sessions.service.js';
import type { RegistrationChallengeProtection } from '../../modules/auth/registration-commands.js';
import { ProtectedPayloadCipher } from '../../database/protected-payload.js';

const MEMORY = 65536,
  PASSES = 3,
  LANES = 1;
const phc = (b: Uint8Array) =>
  Buffer.from(b).toString('base64').replaceAll('=', '');

/** Asynchronous native Argon2id; hash before acquiring SQL locks. Node >=24.7. */
export class RegistrationPasswords {
  private derive(password: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) =>
      argon2(
        'argon2id',
        {
          message: password,
          nonce: salt,
          parallelism: LANES,
          tagLength: 32,
          memory: MEMORY,
          passes: PASSES,
        },
        (err, key) =>
          err
            ? reject(new Error('No se pudo proteger la contraseña.'))
            : resolve(key),
      ),
    );
  }
  async hash(password: string): Promise<string> {
    if (
      typeof password !== 'string' ||
      Array.from(password).length < 12 ||
      Array.from(password).length > 128
    )
      throw new RangeError('Contraseña inválida.');
    const salt = randomBytes(16);
    const key = await this.derive(password, salt);
    return `$argon2id$v=19$m=${MEMORY},t=${PASSES},p=${LANES}$${phc(salt)}$${phc(key)}`;
  }
  async verify(password: string, encoded: string): Promise<boolean> {
    const m =
      /^\$argon2id\$v=19\$m=65536,t=3,p=1\$([A-Za-z0-9+/]{22})\$([A-Za-z0-9+/]{43})$/.exec(
        encoded,
      );
    if (!m || Array.from(password).length > 128) return false;
    const salt = Buffer.from(m[1], 'base64');
    const expected = Buffer.from(m[2], 'base64');
    if (phc(salt) !== m[1] || phc(expected) !== m[2]) return false;
    return timingSafeEqual(await this.derive(password, salt), expected);
  }
}

/** Signs only; Uzzi's access capability must still validate sessions and permissions. */
export class RegistrationJwtSigner implements RegistrationAccessSigner {
  private readonly key: KeyObject;
  readonly publicKey: KeyObject;
  constructor(
    pem: string,
    private readonly issuer: string,
    private readonly audience: string,
    private readonly keyId: string,
  ) {
    try {
      this.key = createPrivateKey(pem);
      this.publicKey = createPublicKey(this.key);
      if (
        this.key.asymmetricKeyType !== 'rsa' ||
        (this.key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048 ||
        ![issuer, audience, keyId].every((v) => v.trim().length > 0)
      )
        throw new Error();
    } catch {
      throw new Error('Configuración de firma JWT inválida.');
    }
  }
  signPlayerAccess(
    i: Parameters<RegistrationAccessSigner['signPlayerAccess']>[0],
  ): string {
    if (!Number.isFinite(i.issuedAt.getTime()) || i.expiresInSeconds !== 900)
      throw new RangeError('Vigencia de acceso inválida.');
    const encode = (v: unknown) =>
      Buffer.from(JSON.stringify(v)).toString('base64url');
    const iat = Math.floor(i.issuedAt.getTime() / 1000);
    const header = encode({ alg: 'RS256', typ: 'JWT', kid: this.keyId });
    const body = encode({
      iss: this.issuer,
      aud: this.audience,
      sub: i.accountId,
      sid: i.sessionId,
      rol: 'JUGADOR',
      iat,
      exp: iat + i.expiresInSeconds,
    });
    const input = header + '.' + body;
    return (
      input +
      '.' +
      sign('RSA-SHA256', Buffer.from(input), this.key).toString('base64url')
    );
  }
}

export type RegistrationDeliveryPayload = Parameters<
  RegistrationChallengeProtection['protectMail']
>[0];
export class RegistrationMailProtection implements RegistrationChallengeProtection {
  readonly verifierKey: Uint8Array;
  private readonly box: ProtectedPayloadCipher;
  constructor(verifierKey: Uint8Array, encryptionKey: Uint8Array) {
    if (
      verifierKey.length !== 32 ||
      Buffer.from(verifierKey).equals(Buffer.from(encryptionKey))
    )
      throw new Error('Claves de registro inválidas.');
    this.verifierKey = Buffer.from(verifierKey);
    this.box = new ProtectedPayloadCipher(encryptionKey);
  }
  protectMail(i: RegistrationDeliveryPayload): Uint8Array {
    return this.box.seal(
      JSON.stringify({ ...i, expiresAt: i.expiresAt.toISOString() }),
      'registration-mail:' + i.challengeId,
    );
  }
  recoverMail(challengeId: string, b: Uint8Array): RegistrationDeliveryPayload {
    try {
      const v = JSON.parse(
        this.box.open(b, 'registration-mail:' + challengeId),
      ) as Record<string, unknown>;
      if (
        v.challengeId !== challengeId ||
        typeof v.destinationEmail !== 'string' ||
        typeof v.code !== 'string' ||
        !/^\d{6}$/.test(v.code) ||
        typeof v.expiresAt !== 'string'
      )
        throw new Error();
      const expiresAt = new Date(v.expiresAt);
      if (!Number.isFinite(expiresAt.getTime())) throw new Error();
      return {
        challengeId,
        destinationEmail: v.destinationEmail,
        code: v.code as string,
        expiresAt,
      };
    } catch {
      throw new Error('Mensaje de registro no recuperable.');
    }
  }
}
