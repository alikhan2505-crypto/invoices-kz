// Проверка подключения к Kaspi перед открытием страницы кабинета (аудит Kaspi
// 2026-11-06, K12, вторая волна).
//
// Раньше каждая страница читала ответ /api/kaspi-shop/wallet так: нет поля
// connected -> «магазин не подключён» -> router.push('/kaspi-shop'). Любой сбой
// запроса (500, обрыв сети, протухший вход) выглядел как «не подключён» и
// уводил подключённого продавца на окно подключения. Здесь три исхода:
//   ready    -- магазин подключён и сессия жива, страницу можно открывать;
//   redirect -- магазин честно не подключён, сессия Kaspi истекла или протух вход (401):
//               на /kaspi-shop (оттуда при необходимости на /login);
//   error    -- сам запрос не удался: показать «Повторить», никуда не уводить.
import { apiErrorMessage } from './dempingForm'

export type KaspiConnectionCheck =
  | { kind: 'ready'; data: Record<string, any> }
  | { kind: 'redirect'; reason: 'not_connected' | 'session_expired'; data: Record<string, any> }
  | { kind: 'error'; message: string }

export const CONNECTION_NETWORK_ERROR = 'Не удалось загрузить данные. Проверьте соединение и попробуйте ещё раз.'
const CONNECTION_FALLBACK_ERROR = 'Не удалось проверить подключение к Kaspi. Попробуйте ещё раз.'

export async function checkKaspiConnection(
  accessToken: string | null | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<KaspiConnectionCheck> {
  let res: Response
  try {
    res = await fetchImpl('/api/kaspi-shop/wallet', { headers: { Authorization: `Bearer ${accessToken}` } })
  } catch {
    return { kind: 'error', message: CONNECTION_NETWORK_ERROR }
  }
  const data = await res.json().catch(() => null)
  // 401: протух вход в приглашённый аккаунт (не сессия Kaspi). «Повторить» тут не
  // поможет и сырой английский «Unauthorized» человеку ни о чём не говорит: уводим на
  // /kaspi-shop, а он, не найдя пользователя, ведёт на /login. Причина остаётся
  // 'not_connected' (страницы, которые различают причины, не меняются), признак
  // входа лежит в data.unauthorized.
  if (res.status === 401) return { kind: 'redirect', reason: 'not_connected', data: { unauthorized: true } }
  if (!res.ok) return { kind: 'error', message: apiErrorMessage(res.status, data, CONNECTION_FALLBACK_ERROR) }
  // 200 без разбираемого тела тоже не доказывает, что магазин не подключён.
  if (!data || typeof data !== 'object') return { kind: 'error', message: CONNECTION_FALLBACK_ERROR }
  if (!data.connected) return { kind: 'redirect', reason: 'not_connected', data }
  if (data.sessionStatus === 'session_expired') return { kind: 'redirect', reason: 'session_expired', data }
  return { kind: 'ready', data }
}
