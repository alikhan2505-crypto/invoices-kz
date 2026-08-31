// Unified-wallet delegates. Since the 2026-08-18 wallet merge, Kaspi Shop
// spend lives in the shared tenge wallet (profiles.kaspi_wallet_balance +
// wallet_ledger). Signatures preserved so checkCycle.ts and the API routes
// didn't have to change; "credits" params are converted ×5 to tenge here.
import {
  getWalletBalance,
  debitWallet,
  checkAndSettleWalletTopup,
  type WalletTopupRow,
} from '@/lib/kaspiPay/wallet'

export const KASPI_SHOP_CREDIT_PRICE_TENGE = 5

export async function getKaspiShopWalletBalance(userId: string): Promise<number> {
  return getWalletBalance(userId)
}

export async function debitKaspiShopWallet(userId: string, credits: number, note: string): Promise<number> {
  return debitWallet(userId, credits * KASPI_SHOP_CREDIT_PRICE_TENGE, 'kaspi_shop_check', note)
}

export type KaspiShopWalletTopupRow = WalletTopupRow

export async function checkAndSettleKaspiShopWalletTopup(row: WalletTopupRow): Promise<'paid' | 'not_paid' | 'expired' | 'scanning'> {
  return checkAndSettleWalletTopup(row)
}
