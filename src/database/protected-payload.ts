import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { PersistenceInvariantError } from './persistence-values.js';

/** Versioned AES-GCM envelope, bound to the purpose and database record. */
export class ProtectedPayloadCipher {
  private readonly key: Buffer;
  constructor(key: Uint8Array) {
    if (key.length !== 32) throw new Error('Clave de protección inválida.');
    this.key = Buffer.from(key);
  }
  seal(plaintext: string, aad: string): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(aad));
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    return Buffer.concat([
      Buffer.from([1]),
      iv,
      cipher.getAuthTag(),
      ciphertext,
    ]);
  }
  open(envelope: Uint8Array, aad: string): string {
    try {
      const b = Buffer.from(envelope);
      if (b.length < 29 || b[0] !== 1) throw new Error();
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.key,
        b.subarray(1, 13),
      );
      decipher.setAAD(Buffer.from(aad));
      decipher.setAuthTag(b.subarray(13, 29));
      return Buffer.concat([
        decipher.update(b.subarray(29)),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new PersistenceInvariantError(
        'Contenido protegido no recuperable.',
      );
    }
  }
}
