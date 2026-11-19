/**
 * Billing policy for integrations called by registered server actions.
 *
 * Each integration must be listed explicitly. User-connected providers use
 * caller billing so the platform resolves the caller's connected account.
 * StudyShowdown generation uses the caller's JWT in src/ai/quiz.ts.
 */

export const integrations: Record<
  string,
  { billing: 'developer' | 'user' }
> = {
  google: { billing: 'user' },
  composio: { billing: 'user' },
}
