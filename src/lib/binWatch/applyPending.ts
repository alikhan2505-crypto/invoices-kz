import { consumePendingBinWatch, pickPendingBin } from './pendingIntent'

// После входа новичок попадает на тур (/dashboard), а не на /profile/bin-watch, поэтому
// БИН, который он поставил на слежение до регистрации, нигде не добавлялся (30.10.2026).
// /auth/callback вызывает это перед переходом: БИН берётся из этого браузера или из
// метаданных письма (письмо открыли в другом браузере), добавляется через /api/bin-watch
// в фоне (первая проверка БИН может занять секунды, переход ждать её не должен).
// Любая ошибка молча игнорируется: вход важнее.
export function addPendingBinWatchInBackground(accessToken: string, metaBin: unknown, isNewAccount: boolean): void {
  try {
    const bin = pickPendingBin(consumePendingBinWatch(), metaBin, isNewAccount)
    if (!bin) return
    fetch('/api/bin-watch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ bin }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    // Хранилище или сеть недоступны: вход уже состоялся.
  }
}
