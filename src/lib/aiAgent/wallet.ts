// Unified-wallet delegates (see kaspiShop/wallet.ts for the merge context).
import {
  getWalletBalance,
  debitWallet,
  checkAndSettleWalletTopup,
  type WalletTopupRow,
} from '@/lib/kaspiPay/wallet'

export const AI_AGENT_CREDIT_PRICE_TENGE = 5
export const AI_AGENT_CREDITS_PER_AI_REPLY = 1

export async function getAiAgentWalletBalance(userId: string): Promise<number> {
  return getWalletBalance(userId)
}

// Founder's explicit call: once the unified wallet is empty/negative, the
// AI-agent must stop generating real replies -- every channel previously
// generated and sent one regardless, debiting further into negative (the
// same documented "gating happens at top-up time" policy that let this
// project's own admin wallet drift to -745 from the founder's own feature
// testing). Checked BEFORE calling the AI model, not just before the debit,
// so a depleted wallet also stops burning real Anthropic API cost on a
// reply that was never going to be billed anyway.
export async function hasAiAgentBudget(userId: string): Promise<boolean> {
  const balance = await getAiAgentWalletBalance(userId)
  return balance >= AI_AGENT_CREDIT_PRICE_TENGE * AI_AGENT_CREDITS_PER_AI_REPLY
}

// Sent instead of a real AI reply once the wallet is depleted -- founder's
// choice (over staying silent, or granting a free grace reply) was a short,
// honest canned message so the customer isn't left hanging. Every call site
// that sends this skips the wallet debit entirely -- it is never billed.
export const AI_AGENT_BUDGET_DEPLETED_REPLY = 'Спасибо за сообщение! Мы скоро ответим вам лично.'

export async function debitAiAgentWallet(userId: string, credits: number, note: string): Promise<number> {
  return debitWallet(userId, credits * AI_AGENT_CREDIT_PRICE_TENGE, 'ai_agent_reply', note)
}

export type AiAgentWalletTopupRow = WalletTopupRow

export async function checkAndSettleAiAgentWalletTopup(row: WalletTopupRow): Promise<'paid' | 'not_paid' | 'expired' | 'scanning' | 'failed'> {
  return checkAndSettleWalletTopup(row)
}
