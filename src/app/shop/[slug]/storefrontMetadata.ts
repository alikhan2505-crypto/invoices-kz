import 'server-only'
import { cache } from 'react'
import type { Metadata } from 'next'
import { resolvePublicStorefront, isValidSlug } from '@/lib/kaspiShop/storefront'
import { loadWholesaleModel } from '@/lib/kaspiShop/wholesaleStorefront'

// Заголовки витрины для поисковиков и превью ссылок в WhatsApp/Telegram.
// Сами страницы витрины — клиентские (язык живёт в браузере), поэтому сервер
// языка покупателя не знает: как и на /lp и /products, отдаём русский +
// казахский сразу. Только чтение — тот же резолвер, что у /api/shop/[slug].
//
// Закрытая (Pro продавца истёк) или несуществующая витрина получает
// нейтральный заголовок без названия компании и noindex — ничего о продавце
// наружу не уходит, ровно как в API ('unavailable' / 'not_found').

type Resolved = Awaited<ReturnType<typeof resolvePublicStorefront>>

// 'error' — сбой БД, а не «витрины нет»: такой ответ не должен прятать живую
// витрину из поиска (noindex), иначе один неудачный обход робота выкидывает её.
const resolveForMetadata = cache(async (slug: string): Promise<Resolved | 'error'> => {
  if (!isValidSlug(slug)) return { status: 'not_found' }
  try {
    return await resolvePublicStorefront(slug)
  } catch (e) {
    console.error('storefront metadata: resolve failed', e instanceof Error ? e.message : e)
    return 'error'
  }
})

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function modelForMetadata(connectionId: string, modelId: string) {
  if (!UUID.test(modelId)) return null
  try {
    return await loadWholesaleModel(connectionId, modelId)
  } catch (e) {
    console.error('storefront metadata: model lookup failed', e instanceof Error ? e.message : e)
    return undefined
  }
}

export type StorefrontPage = 'shop' | 'catalog' | 'model'

const NEUTRAL_TITLE = 'Онлайн-витрина · Онлайн дүкен | invoices.kz'

// alternates/openGraph заданы явно: иначе страница унаследует из корневого
// layout canonical и og:url главной invoices.kz — «noindex + canonical на
// другую страницу» поисковикам противоречит.
const NEUTRAL: Metadata = {
  title: NEUTRAL_TITLE,
  robots: { index: false, follow: false },
  alternates: { canonical: null },
  openGraph: { type: 'website', siteName: 'INVOICES.KZ', title: NEUTRAL_TITLE },
}

function snippet(text: string | null | undefined, max = 160): string | null {
  const flat = (text || '').replace(/\s+/g, ' ').trim()
  if (!flat) return null
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

export async function storefrontMetadata(slug: string, page: StorefrontPage, path: string, modelId?: string): Promise<Metadata> {
  const url = `https://invoices.kz${path}`
  const resolved = await resolveForMetadata(slug)
  if (resolved === 'error') return { title: NEUTRAL_TITLE, alternates: { canonical: url } }
  if (resolved.status !== 'ok') return NEUTRAL
  const sf = resolved.storefront
  const name = (sf.companyName || '').trim() || slug

  let title: string
  let description: string
  let image: string | null = null
  let robots: Metadata['robots'] | undefined

  if (page === 'model' && modelId) {
    const model = await modelForMetadata(sf.connectionId, modelId)
    if (model) {
      title = `${model.name} — ${name}`
      description = `${model.name}: оптом от ${name}, заявка и счёт на оплату онлайн. ${model.name}: ${name} көтерме сауда, өтінім және төлем шоты онлайн.`
      image = model.imageUrl
    } else {
      title = `${name} — оптовый каталог · көтерме сауда каталогы`
      description = `Оптовый каталог ${name}. ${name} көтерме сауда каталогы.`
      // null — модели нет (удалена/чужая ссылка): мягкий 404 не индексируем.
      if (model === null) robots = { index: false, follow: true }
    }
  } else if (page === 'shop') {
    title = `${name} — онлайн-витрина · онлайн дүкен`
    // Лендинг производителя (оптовик) — описание из его собственной истории.
    description = (sf.landingEnabled && snippet(sf.landingHistory))
      || `Товары ${name} с оплатой через Kaspi. ${name} тауарлары, Kaspi арқылы төлеу.`
  } else {
    title = `${name} — оптовый каталог · көтерме сауда каталогы`
    description = `Оптовый каталог ${name}: заявка и счёт на оплату онлайн. ${name} көтерме сауда каталогы: өтінім және төлем шоты онлайн.`
  }

  const images = image ? [{ url: image, alt: title }] : undefined
  return {
    title,
    description,
    ...(robots ? { robots } : {}),
    alternates: { canonical: url },
    openGraph: { type: 'website', url, title, description, siteName: 'INVOICES.KZ', locale: 'ru_KZ', alternateLocale: ['kk_KZ'], ...(images ? { images } : {}) },
    twitter: { card: images ? 'summary_large_image' : 'summary', title, description, ...(image ? { images: [image] } : {}) },
  }
}
