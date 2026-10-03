// Token estimates. The gateway has to count before the upstream does: rate limits
// reserve tokens on the way in, and a budget is enforced while the stream is
// still running, when an Anthropic stream has not reported output tokens yet
// (they arrive in the final message_delta). The estimate is reconciled with the
// upstream's authoritative count when it arrives.

/** About four characters per token for English prose, never less than one per word. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let words = 0;
  let inWord = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    const space = c === 32 || c === 10 || c === 9 || c === 13;
    if (!space && !inWord) words++;
    inWord = !space;
  }
  return Math.max(words, Math.ceil(text.length / 4));
}

export const estimateMessages = (system: string | undefined, messages: readonly { content: string }[]): number =>
  estimateTokens(system ?? "") + messages.reduce((n, m) => n + 4 + estimateTokens(m.content), 0);

/** USD for a call. Prices are per million tokens. */
export const costUsd = (inputTokens: number, outputTokens: number, price: { inputPerMTok: number; outputPerMTok: number }) =>
  (inputTokens * price.inputPerMTok + outputTokens * price.outputPerMTok) / 1e6;
