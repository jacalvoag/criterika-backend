/**
 * Level reward rules from the OpenAPI contract (info description): a normal
 * level gives 150 gems and 100 XP; a unit final gives 300 gems, 250 XP and
 * the unit card, replacing (not adding to) the normal reward. Repeating a
 * level never grants the initial reward again, but an approved repetition
 * still counts for the streak. A final level cannot run without a card.
 *
 * The policy (schema RewardPolicy) keeps the level's values and flags whether
 * they are still claimable; the granted reward (schema Reward, without
 * terminosIds, which belong to dictionary) is zero on a repetition.
 *
 * Pure functions: they never touch balances.
 */

/** Level kind as in schema LevelSummary.tipo. */
export type LevelRewardKind = 'NORMAL' | 'FINAL_UNIDAD';

export const NORMAL_LEVEL_REWARD = { gemas: 150, xp: 100 } as const;
export const FINAL_LEVEL_REWARD = { gemas: 300, xp: 250 } as const;

/** Schema RewardPolicy: what the level offers. */
export interface RewardPolicy {
  gemas: number;
  xp: number;
  cartaId: string | null;
  primeraAprobacionPendiente: boolean;
}

/** Schema Reward without terminosIds: what an approval actually grants. */
export interface GrantedReward {
  gemas: number;
  xp: number;
  cartaId: string | null;
}

export interface RewardPolicyInput {
  tipo: LevelRewardKind;
  cartaId: string | null;
  primeraAprobacionRegistrada: boolean;
}

/** MISSING_CARD is an internal reason (no contract code). */
export type RewardPolicyResult =
  | { ok: true; recompensa: RewardPolicy }
  | { ok: false; reason: 'MISSING_CARD' };

export interface GrantedRewardResult {
  recompensa: GrantedReward;
  cuentaParaRacha: true;
}

export function calculateRewardPolicy(
  input: RewardPolicyInput,
): RewardPolicyResult {
  const primeraAprobacionPendiente = !input.primeraAprobacionRegistrada;

  if (input.tipo === 'NORMAL') {
    return {
      ok: true,
      recompensa: {
        ...NORMAL_LEVEL_REWARD,
        cartaId: null,
        primeraAprobacionPendiente,
      },
    };
  }

  if (input.cartaId === null) {
    return { ok: false, reason: 'MISSING_CARD' };
  }

  return {
    ok: true,
    recompensa: {
      ...FINAL_LEVEL_REWARD,
      cartaId: input.cartaId,
      primeraAprobacionPendiente,
    },
  };
}

export function calculateGrantedReward(
  policy: RewardPolicy,
): GrantedRewardResult {
  const recompensa: GrantedReward = policy.primeraAprobacionPendiente
    ? { gemas: policy.gemas, xp: policy.xp, cartaId: policy.cartaId }
    : { gemas: 0, xp: 0, cartaId: null };

  return { recompensa, cuentaParaRacha: true };
}
