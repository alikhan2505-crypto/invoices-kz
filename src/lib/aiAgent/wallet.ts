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

export async function debitAiAgentWallet(userId: string, credits: number, note: string): Promise<number> {
  return debitWallet(userId, credits * AI_AGENT_CREDIT_PRICE_TENGE, 'ai_agent_reply', note)
}

export type AiAgentWalletTopupRow = WalletTopupRow

export async function checkAndSettleAiAgentWalletTopup(row: WalletTopupRow): Promise<'paid' | 'not_paid' | 'expired' | 'scanning' | 'failed'> {
  return checkAndSettleWalletTopup(row)
}
