import {
  IdempotencyStore,
  idempotencyFromEnvironment,
} from './idempotency-store.js';

const keys = {
  IDEMPOTENCY_HMAC_KEY_BASE64: Buffer.alloc(32, 11).toString('base64'),
  IDEMPOTENCY_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 22).toString('base64'),
};
const identity = {
  cuentaId: 'jugador-ficticio',
  sesionId: 'sesion-ficticia',
  metodo: 'POST' as const,
  ruta: '/levels/nivel-ficticio/attempts',
};

describe('Configuración y huellas de idempotencia', () => {
  it('exige claves completas, independientes y en base64 canónico', () => {
    expect(() => idempotencyFromEnvironment({})).toThrow(
      'IDEMPOTENCY_HMAC_KEY_BASE64',
    );
    expect(() =>
      idempotencyFromEnvironment({
        ...keys,
        IDEMPOTENCY_HMAC_KEY_BASE64: 'secreto-no-validable',
      }),
    ).toThrow();
    expect(
      () => new IdempotencyStore(Buffer.alloc(32), Buffer.alloc(32)),
    ).toThrow('independientes');
    expect(
      () => new IdempotencyStore(Buffer.alloc(31), Buffer.alloc(32)),
    ).toThrow();
    expect(idempotencyFromEnvironment(keys)).toBeInstanceOf(IdempotencyStore);
  });

  it('la huella normaliza objetos y distingue cuerpo, sesión, jugador y recurso', () => {
    const store = idempotencyFromEnvironment(keys);
    const base = store.fingerprint(identity, { b: 2, a: 1 });
    expect(base.equals(store.fingerprint(identity, { a: 1, b: 2 }))).toBe(true);
    expect(base.equals(store.fingerprint(identity, { a: 1, b: 3 }))).toBe(
      false,
    );
    expect(
      base.equals(
        store.fingerprint({ ...identity, sesionId: 'otra' }, { a: 1, b: 2 }),
      ),
    ).toBe(false);
    expect(
      base.equals(
        store.fingerprint({ ...identity, cuentaId: 'otro' }, { a: 1, b: 2 }),
      ),
    ).toBe(false);
    expect(
      base.equals(
        store.fingerprint(
          { ...identity, ruta: '/levels/otro/attempts' },
          { a: 1, b: 2 },
        ),
      ),
    ).toBe(false);
  });

  it('los errores de configuración no incluyen el valor de una clave', () => {
    const secret = 'valor-privado-ficticio';
    try {
      idempotencyFromEnvironment({
        ...keys,
        IDEMPOTENCY_ENCRYPTION_KEY_BASE64: secret,
      });
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });
});
