/** Result shared by every minigame evaluator. */
export type EvaluationResult<Feedback, Reason extends string> =
  { ok: true; feedback: Feedback } | { ok: false; reason: Reason };
