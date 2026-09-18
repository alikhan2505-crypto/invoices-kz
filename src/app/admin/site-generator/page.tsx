'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { LANDING_PATTERNS } from '@/lib/salonSites/patterns'
import type { SalonData, SalonService, SalonSiteVariant } from '@/lib/salonSites/types'

const BASE_DOMAIN = process.env.NEXT_PUBLIC_SITE_DOMAIN || 'invoices.kz'

type SiteRow = {
  id: string
  slug: string
  salon: SalonData
  pattern: string
  status: 'draft' | 'published'
  published_at: string | null
}

const EMPTY_SALON: SalonData = {
  name: '', city: '', address: '', phone: '',
  whatsapp: '', instagram: '', about: '', workingHours: '', styleNotes: '',
  services: [{ name: '', price: '' }],
  masters: [],
  ratingBadge: '',
}

export default function SiteGenerator() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [sites, setSites] = useState<SiteRow[]>([])
  const [error, setError] = useState<string | null>(null)

  const [salon, setSalon] = useState<SalonData>(EMPTY_SALON)
  const [slug, setSlug] = useState('')
  const [pattern, setPattern] = useState(LANDING_PATTERNS[0].id)
  const [mastersText, setMastersText] = useState('')
  // Один отзыв -- одна строка. Владелец вставляет реальные цитаты клиентов
  // (например, скопированные с 2ГИС) сюда вручную: автоматически стянуть их
  // с 2ГИС нельзя (см. generateLanding.ts) -- их страницы отдают ботам
  // заглушку вместо контента, подтверждено вживую 2026-09-17.
  const [reviewsText, setReviewsText] = useState('')
  // Ссылка на карточку организации в 2ГИС -- "Заполнить по ссылке" тянет
  // название/адрес/телефон/часы/рейтинг через официальный API 2ГИС
  // (fetch2gis.ts). Тексты самих отзывов API не отдаёт -- те по-прежнему
  // через reviewsText выше.
  const [twoGisUrl, setTwoGisUrl] = useState('')
  const [fetchingTwoGis, setFetchingTwoGis] = useState(false)

  const [siteId, setSiteId] = useState<string | null>(null)
  const [variants, setVariants] = useState<SalonSiteVariant[]>([])
  const [generating, setGenerating] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [preview, setPreview] = useState<SalonSiteVariant | null>(null)
  // Демо на паттерн -- статичный пример, сгенерированный заранее (см. комментарий
  // в api/salon-sites/demo/[patternId]/route.ts), а не по клику: иначе каждый
  // просмотр стиля перед выбором стоил бы настоящей генерации.
  const [demo, setDemo] = useState<{ patternLabel: string; html: string } | null>(null)
  const [loadingDemoId, setLoadingDemoId] = useState<string | null>(null)

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!profile?.is_admin) { router.push('/dashboard'); return }

    setReady(true)
    await loadSites()
  }

  async function loadSites() {
    const res = await fetch('/api/salon-sites', { headers: await authHeader() })
    const json = await res.json()
    if (res.ok) setSites(json.sites)
  }

  // Гейт админа и первая загрузка списка: обе проверки требуют сессию из
  // браузера, поэтому живут в эффекте на монтирование.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void init() }, [])

  function updateService(index: number, patch: Partial<SalonService>) {
    setSalon((prev) => ({
      ...prev,
      services: prev.services.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }))
  }

  async function fillFrom2gis() {
    if (!twoGisUrl.trim()) return
    setError(null)
    setFetchingTwoGis(true)
    try {
      const res = await fetch('/api/salon-sites/fetch-2gis', {
        method: 'POST',
        headers: await authHeader(),
        body: JSON.stringify({ url: twoGisUrl.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'не удалось получить данные из 2ГИС')

      const place = json.place as {
        name?: string; address?: string; phone?: string; workingHours?: string; ratingBadge?: string; lat?: number; lon?: number
      }
      // full_address_name обычно приходит как "Город, Улица дом" -- делим по
      // первой запятой, но оба поля остаются редактируемыми, если разбор
      // для конкретного адреса ушёл криво.
      const [cityGuess, ...addressRest] = (place.address ?? '').split(',')
      const addressGuess = addressRest.join(',').trim()

      setSalon((prev) => ({
        ...prev,
        name: place.name || prev.name,
        city: addressGuess ? cityGuess.trim() : prev.city,
        address: addressGuess || place.address || prev.address,
        phone: place.phone || prev.phone,
        workingHours: place.workingHours || prev.workingHours,
        ratingBadge: place.ratingBadge || prev.ratingBadge,
        lat: place.lat ?? prev.lat,
        lon: place.lon ?? prev.lon,
      }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'не удалось получить данные из 2ГИС')
    } finally {
      setFetchingTwoGis(false)
    }
  }

  async function showDemo(p: { id: string; label: string }) {
    setError(null)
    setLoadingDemoId(p.id)
    try {
      const res = await fetch(`/api/salon-sites/demo/${p.id}`, { headers: await authHeader() })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error === 'demo_not_generated' ? 'демо для этого паттерна ещё не сгенерировано' : (json.error || 'не удалось загрузить демо'))
      setDemo({ patternLabel: p.label, html: json.html })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'не удалось загрузить демо')
    } finally {
      setLoadingDemoId(null)
    }
  }

  async function createAndGenerate() {
    setError(null)
    setGenerating(true)
    setVariants([])

    try {
      const payload = {
        ...salon,
        masters: mastersText.split(',').map((m) => m.trim()).filter(Boolean),
        reviews: reviewsText.split('\n').map((r) => r.trim()).filter(Boolean),
        services: salon.services.filter((s) => s.name.trim() && s.price.trim()),
      }

      const headers = await authHeader()
      const res = await fetch('/api/salon-sites', {
        method: 'POST',
        headers,
        body: JSON.stringify({ slug, salon: payload, pattern }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(errorText(json.error))

      const id: string = json.site.id
      setSiteId(id)
      await generateVariants(id, headers)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не получилось')
    } finally {
      setGenerating(false)
    }
  }

  // Три параллельных запроса: каждый вариант приходит своим ответом и
  // показывается сразу, не дожидаясь двух других.
  async function generateVariants(id: string, headers: Record<string, string>) {
    const results = await Promise.allSettled([1, 2, 3].map(async (variantNo) => {
      const res = await fetch(`/api/salon-sites/${id}/generate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ variantNo }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(errorText(json.error))
      setVariants((prev) => [...prev, json.variant].sort((a, b) => a.variant_no - b.variant_no))
      return json.variant as SalonSiteVariant
    }))

    const failed = results.filter((r) => r.status === 'rejected').length
    if (failed === 3) throw new Error('Ни один вариант не сгенерировался')
    if (failed > 0) setError(`${failed} из 3 вариантов не сгенерировались — можно перегенерировать`)
  }

  async function regenerate(variantNo: number) {
    if (!siteId) return
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch(`/api/salon-sites/${siteId}/generate`, {
        method: 'POST',
        headers: await authHeader(),
        body: JSON.stringify({ variantNo }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(errorText(json.error))
      setVariants((prev) => prev.map((v) => (v.variant_no === variantNo ? json.variant : v)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не получилось')
    } finally {
      setGenerating(false)
    }
  }

  async function publish(variantId: string) {
    if (!siteId) return
    setPublishing(true)
    setError(null)
    try {
      const res = await fetch(`/api/salon-sites/${siteId}/publish`, {
        method: 'POST',
        headers: await authHeader(),
        body: JSON.stringify({ variantId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(errorText(json.error))
      setPreview(null)
      setSiteId(null)
      setVariants([])
      setSalon(EMPTY_SALON)
      setSlug('')
      setMastersText('')
      setReviewsText('')
      setTwoGisUrl('')
      await loadSites()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не получилось')
    } finally {
      setPublishing(false)
    }
  }

  if (!ready) {
    return <main className="min-h-screen bg-gray-900 text-white p-6 text-sm text-gray-400">Загрузка…</main>
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white salon-admin-form">
      {/* Founder-reported 2026-09-17: typed text read as invisible on this
          page's dark inputs. Root cause: a site-wide `input { -webkit-text-
          fill-color: #111827 }` rule (light-theme default, in globals.css)
          sets a WebKit/Blink-only property inputClass's text-white never
          touches -- color and -webkit-text-fill-color are independent for
          the cascade. Override lives in globals.css (.salon-admin-form
          input, .salon-admin-form textarea), scoped to this page since
          every other page here is light-themed and would break under a
          blanket white-text rule. Same bug/fix already exists for
          .cashier-dev-theme -- see that rule's comment for the fuller
          writeup. */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <div>
          <div className="font-bold text-lg">Генератор сайтов</div>
          <div className="text-xs text-gray-400">Лендинги салонов на поддоменах {BASE_DOMAIN}</div>
        </div>
        <button onClick={() => router.push('/admin')} className="text-xs bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg">
          В админку
        </button>
      </div>

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {error && (
          <div className="bg-red-500/10 border border-red-500/40 text-red-300 rounded-xl px-4 py-3 text-sm">{error}</div>
        )}

        {!siteId && (
          <section className="bg-gray-800 rounded-2xl p-5 space-y-4">
            <h2 className="font-semibold">Новый сайт</h2>

            <Field label="Поддомен">
              <div className="flex items-center gap-2">
                <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())}
                  placeholder="lotos" className={inputClass} />
                <span className="text-xs text-gray-400 whitespace-nowrap">.{BASE_DOMAIN}</span>
              </div>
            </Field>

            <Field label="Ссылка на 2ГИС (необязательно)">
              <div className="flex items-center gap-2">
                <input value={twoGisUrl} onChange={(e) => setTwoGisUrl(e.target.value)}
                  placeholder="https://2gis.kz/shymkent/firm/70000001101134746" className={inputClass} />
                <button onClick={fillFrom2gis} disabled={fetchingTwoGis || !twoGisUrl.trim()}
                  className="text-xs bg-gray-700 text-gray-200 px-3 py-2.5 rounded-lg whitespace-nowrap disabled:opacity-50">
                  {fetchingTwoGis ? 'Тяну…' : 'Заполнить по ссылке'}
                </button>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Подтянет название/адрес/часы/рейтинг/координаты (для кнопки «Как доехать») через официальный API 2ГИС. Телефон и тексты отзывов API не отдаёт (demo-ключ без доступа к контактам) — их по-прежнему вписывать вручную.
              </div>
            </Field>

            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Название салона">
                <input value={salon.name} onChange={(e) => setSalon({ ...salon, name: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Город">
                <input value={salon.city} onChange={(e) => setSalon({ ...salon, city: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Адрес">
                <input value={salon.address} onChange={(e) => setSalon({ ...salon, address: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Телефон">
                <input value={salon.phone} onChange={(e) => setSalon({ ...salon, phone: e.target.value })} className={inputClass} />
              </Field>
              <Field label="WhatsApp">
                <input value={salon.whatsapp ?? ''} onChange={(e) => setSalon({ ...salon, whatsapp: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Instagram">
                <input value={salon.instagram ?? ''} onChange={(e) => setSalon({ ...salon, instagram: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Часы работы">
                <input value={salon.workingHours ?? ''} onChange={(e) => setSalon({ ...salon, workingHours: e.target.value })}
                  placeholder="Пн–Сб 10:00–20:00" className={inputClass} />
              </Field>
              <Field label="Мастера через запятую">
                <input value={mastersText} onChange={(e) => setMastersText(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Рейтинг (необязательно)">
                <input value={salon.ratingBadge ?? ''} onChange={(e) => setSalon({ ...salon, ratingBadge: e.target.value })}
                  placeholder="4.6 из 5 · 209 оценок (2ГИС)" className={inputClass} />
              </Field>
            </div>

            <Field label="Реальные отзывы клиентов (по одному на строку, необязательно)">
              <textarea value={reviewsText} onChange={(e) => setReviewsText(e.target.value)}
                rows={4} placeholder={'Скопируйте несколько реальных отзывов, например с 2ГИС или Google-карт.\nОдна строка — один отзыв. Автоматически стянуть их с сайта нельзя (см. подсказку), только руками.'}
                className={inputClass} />
            </Field>

            <Field label="О салоне">
              <textarea value={salon.about ?? ''} onChange={(e) => setSalon({ ...salon, about: e.target.value })}
                rows={3} className={inputClass} />
            </Field>

            <Field label="Пожелания по стилю">
              <input value={salon.styleNotes ?? ''} onChange={(e) => setSalon({ ...salon, styleNotes: e.target.value })}
                placeholder="пастельные тона, без розового" className={inputClass} />
            </Field>

            <div>
              <div className="text-xs text-gray-400 mb-2">Услуги и цены</div>
              <div className="space-y-2">
                {salon.services.map((service, i) => (
                  <div key={i} className="flex gap-2">
                    <input value={service.name} onChange={(e) => updateService(i, { name: e.target.value })}
                      placeholder="Маникюр" className={inputClass} />
                    <input value={service.price} onChange={(e) => updateService(i, { price: e.target.value })}
                      placeholder="8 000 ₸" className={`${inputClass} max-w-[140px]`} />
                    <input value={service.duration ?? ''} onChange={(e) => updateService(i, { duration: e.target.value })}
                      placeholder="60 мин" className={`${inputClass} max-w-[120px]`} />
                  </div>
                ))}
              </div>
              <button onClick={() => setSalon({ ...salon, services: [...salon.services, { name: '', price: '' }] })}
                className="mt-2 text-xs text-blue-400">
                + услуга
              </button>
            </div>

            <div>
              <div className="text-xs text-gray-400 mb-2">Паттерн лендинга</div>
              <div className="grid sm:grid-cols-2 gap-2">
                {LANDING_PATTERNS.map((p) => (
                  <div key={p.id}
                    className={`rounded-xl px-4 py-3 border text-sm ${
                      pattern === p.id ? 'border-blue-400 bg-blue-500/10' : 'border-gray-700 bg-gray-900'
                    }`}>
                    <button onClick={() => setPattern(p.id)} className="text-left w-full">
                      <div className="font-medium">{p.label}</div>
                      <div className="text-xs text-gray-400 mt-1 line-clamp-2">{p.brief}</div>
                    </button>
                    <button onClick={() => showDemo(p)} disabled={loadingDemoId === p.id}
                      className="text-xs text-blue-400 mt-2 disabled:opacity-50">
                      {loadingDemoId === p.id ? 'Гружу…' : 'Демо'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={createAndGenerate} disabled={generating}
              className="w-full bg-[#1C2056] text-white rounded-xl px-6 py-3 text-sm font-semibold disabled:opacity-50">
              {generating ? 'Генерирую 3 варианта…' : 'Сгенерировать 3 варианта'}
            </button>
          </section>
        )}

        {siteId && (
          <section className="bg-gray-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Варианты для {slug}.{BASE_DOMAIN}</h2>
              {generating && <span className="text-xs text-gray-400">генерация…</span>}
            </div>

            <div className="grid md:grid-cols-3 gap-3">
              {[1, 2, 3].map((no) => {
                const variant = variants.find((v) => v.variant_no === no)
                return (
                  <div key={no} className="bg-gray-900 rounded-xl p-3 space-y-2">
                    <div className="text-sm font-medium">Вариант {no}</div>
                    {variant ? (
                      <>
                        <div className="text-xs text-gray-400 line-clamp-3">{variant.direction}</div>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <button onClick={() => setPreview(variant)} className="text-xs text-blue-400">Смотреть</button>
                          <button onClick={() => regenerate(no)} disabled={generating} className="text-xs text-gray-400 disabled:opacity-50">
                            Перегенерировать
                          </button>
                          <button onClick={() => publish(variant.id)} disabled={publishing}
                            className="text-xs text-[#2DC48D] font-medium disabled:opacity-50">
                            Опубликовать
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="text-xs text-gray-500">{generating ? 'генерируется…' : 'нет'}</div>
                    )}
                  </div>
                )
              })}
            </div>

            <button onClick={() => { setSiteId(null); setVariants([]); setPreview(null) }}
              className="text-xs text-gray-400">
              Отменить и вернуться к форме
            </button>
          </section>
        )}

        <section className="bg-gray-800 rounded-2xl p-5">
          <h2 className="font-semibold mb-3">Сайты</h2>
          {sites.length === 0 ? (
            <div className="text-sm text-gray-500">Пока ни одного.</div>
          ) : (
            <div className="divide-y divide-gray-700">
              {sites.map((site) => (
                <div key={site.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{site.salon?.name || site.slug}</div>
                    <div className="text-xs text-gray-400">{site.slug}.{BASE_DOMAIN}</div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${
                    site.status === 'published' ? 'bg-[#2DC48D]/15 text-[#2DC48D]' : 'bg-gray-700 text-gray-300'
                  }`}>
                    {site.status === 'published' ? 'опубликован' : 'черновик'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {preview && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-900">
            <div className="text-sm">Вариант {preview.variant_no}</div>
            <div className="flex gap-3">
              <button onClick={() => publish(preview.id)} disabled={publishing}
                className="text-sm text-[#2DC48D] font-medium disabled:opacity-50">
                Опубликовать
              </button>
              <button onClick={() => setPreview(null)} className="text-sm text-gray-400">Закрыть</button>
            </div>
          </div>
          {/* sandbox без allow-scripts: превью показывает ровно то, что увидит
              клиент под CSP со script-src 'none'. */}
          <iframe title={`Вариант ${preview.variant_no}`} srcDoc={preview.html} sandbox=""
            className="flex-1 w-full bg-white" />
        </div>
      )}

      {demo && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-900">
            <div className="text-sm">Демо: {demo.patternLabel}</div>
            <button onClick={() => setDemo(null)} className="text-sm text-gray-400">Закрыть</button>
          </div>
          <iframe title={`Демо: ${demo.patternLabel}`} srcDoc={demo.html} sandbox=""
            className="flex-1 w-full bg-white" />
        </div>
      )}
    </main>
  )
}

const inputClass = 'w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-gray-400 mb-1">{label}</span>
      {children}
    </label>
  )
}

function errorText(code: string): string {
  const messages: Record<string, string> = {
    bad_slug: 'Поддомен: только строчные латинские буквы, цифры и дефис, 3–32 символа',
    slug_taken: 'Такой поддомен уже занят',
    bad_salon_data: 'Заполните название, город, адрес, телефон и хотя бы одну услугу',
    bad_pattern: 'Выберите паттерн',
    generation_failed: 'Модель не смогла сгенерировать лендинг — попробуйте ещё раз',
    admin_only: 'Нужны права администратора',
  }
  return messages[code] || code || 'Не получилось'
}
