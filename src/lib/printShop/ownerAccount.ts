import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Личный магазин founder'а -- один владелец на весь /print, его собственный
// Kaspi Pay Cashier и его собственный Telegram для уведомлений о заказах.
// Отдельный env var, а не чтение is_admin=true (сейчас 5 админских
// аккаунтов -- см. product_split_subdomains_invoices_kz память -- выбрать
// "того самого" автоматически нельзя).
export function getPrintShopOwnerUserId(): string {
  const id = process.env.PRINT_SHOP_OWNER_USER_ID
  if (!id) throw new Error('PRINT_SHOP_OWNER_USER_ID is not configured')
  return id
}

export async function loadPrintShopOwnerTelegramChatId(): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('telegram_chat_id')
    .eq('id', getPrintShopOwnerUserId())
    .maybeSingle()
  return data?.telegram_chat_id ?? null
}
