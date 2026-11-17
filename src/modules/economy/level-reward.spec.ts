import {
  calculateGrantedReward,
  calculateRewardPolicy,
  type RewardPolicy,
} from './level-reward.js';

const CARD_ID = '00000000-0000-4000-8000-000000000001';

const policyOf = (
  result: ReturnType<typeof calculateRewardPolicy>,
): RewardPolicy => {
  if (!result.ok) {
    throw new Error(`expected ok, got ${result.reason}`);
  }
  return result.recompensa;
};

describe('calculateRewardPolicy', () => {
  it('ofrece 150 gemas y 100 XP sin carta en un nivel normal nuevo', () => {
    const result = calculateRewardPolicy({
      tipo: 'NORMAL',
      cartaId: null,
      primeraAprobacionRegistrada: false,
    });

    expect(result).toEqual({
      ok: true,
      recompensa: {
        gemas: 150,
        xp: 100,
        cartaId: null,
        primeraAprobacionPendiente: true,
      },
    });
  });

  it('ofrece 300 gemas, 250 XP y carta en un final, sin sumar la normal', () => {
    const result = calculateRewardPolicy({
      tipo: 'FINAL_UNIDAD',
      cartaId: CARD_ID,
      primeraAprobacionRegistrada: false,
    });

    expect(result).toEqual({
      ok: true,
      recompensa: {
        gemas: 300,
        xp: 250,
        cartaId: CARD_ID,
        primeraAprobacionPendiente: true,
      },
    });
  });

  it('conserva los valores del nivel normal en una repetición, sin cobro pendiente', () => {
    const result = calculateRewardPolicy({
      tipo: 'NORMAL',
      cartaId: null,
      primeraAprobacionRegistrada: true,
    });

    expect(result).toEqual({
      ok: true,
      recompensa: {
        gemas: 150,
        xp: 100,
        cartaId: null,
        primeraAprobacionPendiente: false,
      },
    });
  });

  it('conserva los valores del final en una repetición, sin cobro pendiente', () => {
    const result = calculateRewardPolicy({
      tipo: 'FINAL_UNIDAD',
      cartaId: CARD_ID,
      primeraAprobacionRegistrada: true,
    });

    expect(result).toEqual({
      ok: true,
      recompensa: {
        gemas: 300,
        xp: 250,
        cartaId: CARD_ID,
        primeraAprobacionPendiente: false,
      },
    });
  });

  it('rechaza un final sin carta con MISSING_CARD', () => {
    const result = calculateRewardPolicy({
      tipo: 'FINAL_UNIDAD',
      cartaId: null,
      primeraAprobacionRegistrada: false,
    });

    expect(result).toEqual({ ok: false, reason: 'MISSING_CARD' });
  });

  it('ignora una carta en un nivel normal', () => {
    const result = calculateRewardPolicy({
      tipo: 'NORMAL',
      cartaId: CARD_ID,
      primeraAprobacionRegistrada: false,
    });

    expect(policyOf(result).cartaId).toBeNull();
  });
});

describe('calculateGrantedReward', () => {
  it('otorga los valores de la política en la primera aprobación de un normal', () => {
    const policy = policyOf(
      calculateRewardPolicy({
        tipo: 'NORMAL',
        cartaId: null,
        primeraAprobacionRegistrada: false,
      }),
    );

    expect(calculateGrantedReward(policy)).toEqual({
      recompensa: { gemas: 150, xp: 100, cartaId: null },
      cuentaParaRacha: true,
    });
  });

  it('otorga 300 gemas, 250 XP y la carta en la primera aprobación de un final', () => {
    const policy = policyOf(
      calculateRewardPolicy({
        tipo: 'FINAL_UNIDAD',
        cartaId: CARD_ID,
        primeraAprobacionRegistrada: false,
      }),
    );

    expect(calculateGrantedReward(policy)).toEqual({
      recompensa: { gemas: 300, xp: 250, cartaId: CARD_ID },
      cuentaParaRacha: true,
    });
  });

  it.each(['NORMAL', 'FINAL_UNIDAD'] as const)(
    'una repetición de %s nunca otorga nada pero cuenta para racha',
    (tipo) => {
      const policy = policyOf(
        calculateRewardPolicy({
          tipo,
          cartaId: CARD_ID,
          primeraAprobacionRegistrada: true,
        }),
      );

      expect(calculateGrantedReward(policy)).toEqual({
        recompensa: { gemas: 0, xp: 0, cartaId: null },
        cuentaParaRacha: true,
      });
    },
  );
});
