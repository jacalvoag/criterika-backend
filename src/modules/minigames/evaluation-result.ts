/** Result shared by every minigame evaluator. */
export type EvaluationResult<Feedback, Reason extends string> =
  { valid: true; feedback: Feedback } | { valid: false; reason: Reason };
