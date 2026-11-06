import { describe, expect, it } from 'vitest'
import {
  isPublicPath,
  isSecretPage,
  isTrackedHost,
  maskReplayAttribute,
  maskReplayText,
  publicUrlAllowlist,
  sanitizeEvent,
  sanitizeUrl,
  scrubText,
} from './posthogConfig'

type Props = Record<string, unknown>

// Элемент страницы для масок записи: closest() находит блок с данными или нет.
const el = (masked: boolean) => ({ closest: () => (masked ? {} : null) }) as unknown as HTMLElement

describe('isTrackedHost', () => {
  it('считает только хосты платформы', () => {
    for (const h of ['invoices.kz', 'www.invoices.kz', 'kaspi.invoices.kz', 'cfo.invoices.kz', 'docs.invoices.kz', 'INVOICES.KZ']) {
      expect(isTrackedHost(h)).toBe(true)
    }
    for (const h of ['aru-studio.invoices.kz', 'invoices-kz.vercel.app', 'localhost', 'invoices.kz.evil.com', 'xinvoices.kz']) {
      expect(isTrackedHost(h)).toBe(false)
    }
  })
})

describe('isPublicPath', () => {
  it('пишет лендинги, инструменты, гайды и вход', () => {
    for (const p of ['/', '/tools', '/tools/kk/zarplata', '/guides/', '/login', '/login?next=/dashboard', '/bik/kk/halyk-bank', '/lp/kaspi', '/cashier-api', '/privacy']) {
      expect(isPublicPath(p)).toBe(true)
    }
  })
  it('не пишет кабинет, ссылки на счета, договоры, вход по письму и документацию API для вошедших', () => {
    for (const p of ['/dashboard', '/create', '/invoice/1', '/profile', '/kaspi-api', '/kaspi-api/docs', '/docs', '/view/abc', '/contract-view/x', '/auth/callback', '/toolsx', '/s/aru', '/shop/x', '/planner/aru', '/print']) {
      expect(isPublicPath(p)).toBe(false)
    }
  })
})

describe('isSecretPage', () => {
  it('не запускает PostHog там, где секрет в адресе', () => {
    for (const p of ['/view/abc', '/contract-view/x/print', '/verify/sig', '/auth', '/auth/callback', '/auth/callback/']) {
      expect(isSecretPage(p)).toBe(true)
    }
    for (const p of ['/', '/login', '/view', '/authx', '/tools/schet', '/dashboard']) {
      expect(isSecretPage(p)).toBe(false)
    }
  })
})

describe('publicUrlAllowlist', () => {
  const [re] = publicUrlAllowlist()
  it('совпадает с публичными адресами на любом хосте платформы', () => {
    for (const u of ['https://invoices.kz', 'https://invoices.kz/', 'https://kaspi.invoices.kz/?utm_source=ig', 'https://invoices.kz/tools/kk', 'https://invoices.kz/login#x', 'https://api.invoices.kz/cashier-api']) {
      expect(re.test(u)).toBe(true)
    }
  })
  it('не совпадает с кабинетом и чужими сайтами', () => {
    for (const u of ['https://invoices.kz/dashboard', 'https://invoices.kz/toolsx', 'https://invoices.kz/view/abc', 'https://invoices.kz/kaspi-api', 'https://invoices.kz/kaspi-api/docs', 'https://api.invoices.kz/docs', 'https://evil.com/?https://invoices.kz/', 'http://invoices.kz.evil.com/']) {
      expect(re.test(u)).toBe(false)
    }
  })
})

describe('sanitizeUrl', () => {
  it('прячет токен в пути ссылки на счёт, договор и их API', () => {
    expect(sanitizeUrl('/view/abc123')).toBe('/view/[token]')
    expect(sanitizeUrl('https://invoices.kz/view/abc?x=1#y')).toBe('https://invoices.kz/view/[token]?x=1')
    expect(sanitizeUrl('/contract-view/t0k/print')).toBe('/contract-view/[token]/print')
    expect(sanitizeUrl('/verify/sig-1')).toBe('/verify/[id]')
    expect(sanitizeUrl('https://invoices.kz/api/public/invoice/tok/pdf')).toBe('https://invoices.kz/api/public/invoice/[token]/pdf')
  })
  it('убирает коды входа, почту и БИН, оставляя метки как были', () => {
    expect(sanitizeUrl('/auth/callback?code=123&next=/dashboard')).toBe('/auth/callback?next=/dashboard')
    expect(sanitizeUrl('/tools/kontragent?bin=123456789012&utm_source=dm')).toBe('/tools/kontragent?utm_source=dm')
    expect(sanitizeUrl('https://invoices.kz/login?Email=a%40b.kz&utm_campaign=x%20y')).toBe('https://invoices.kz/login?utm_campaign=x%20y')
    expect(sanitizeUrl('https://invoices.kz/#access_token=abc&type=magiclink')).toBe('https://invoices.kz/')
  })
  it('чистит адрес внутри параметра (переход после входа, обёртка ссылок Instagram)', () => {
    expect(sanitizeUrl('/login?next=%2Fview%2Fabc&utm_source=ig')).toBe('/login?next=%2Fview%2F%5Btoken%5D&utm_source=ig')
    expect(sanitizeUrl('https://l.instagram.com/?u=https%3A%2F%2Finvoices.kz%2Fview%2Fabc%3Fpay%3D1&e=AT0'))
      .toBe('https://l.instagram.com/?u=https%3A%2F%2Finvoices.kz%2Fview%2F%5Btoken%5D%3Fpay%3D1&e=AT0')
    expect(sanitizeUrl('/login?next=%2Fauth%2Fcallback%3Fcode%3D9')).toBe('/login?next=%2Fauth%2Fcallback')
  })
  it('не трогает служебные значения и адреса без секретов', () => {
    expect(sanitizeUrl('$direct')).toBe('$direct')
    expect(sanitizeUrl('')).toBe('')
    expect(sanitizeUrl('/login?next=/dashboard')).toBe('/login?next=/dashboard')
    expect(sanitizeUrl('https://l.instagram.com/?u=https%3A%2F%2Finvoices.kz&e=AT0')).toBe('https://l.instagram.com/?u=https%3A%2F%2Finvoices.kz&e=AT0')
    expect(sanitizeUrl('mailto:mail@invoices.kz')).toBe('mailto:mail@invoices.kz')
  })
})

describe('scrubText', () => {
  it('вырезает почту, телефоны, ИИН/БИН и секреты в адресах', () => {
    expect(scrubText('Ссылка отправлена на ivan@gmail.com')).toBe('Ссылка отправлена на [email]')
    expect(scrubText('Звоните +7 701 123 45 67 или 87011234567')).toBe('Звоните [phone] или [phone]')
    expect(scrubText('БИН 990101300123, ИИН 870101300123')).toBe('БИН [iin], ИИН [iin]')
    expect(scrubText('Failed to fetch https://invoices.kz/api/public/invoice/tok')).toBe('Failed to fetch https://invoices.kz/api/public/invoice/[token]')
    expect(scrubText('Ошибка на /view/abc?pay=1')).toBe('Ошибка на /view/[token]?pay=1')
  })
  it('не трогает суммы, даты и обычный текст', () => {
    for (const s of ['Итого: 1 250 000 ₸', 'МРП 4 325 ₸', '05.11.2026', 'Получить ссылку для входа', 'Комиссия 12,5%']) {
      expect(scrubText(s)).toBe(s)
    }
  })
})

describe('маски записи сессии', () => {
  it('в блоке с данными текст скрыт целиком, вне его вырезаются только личные данные', () => {
    expect(maskReplayText('Итого: 1 250 000 ₸', el(true))).toBe('•••')
    expect(maskReplayText('   ', el(true))).toBe('   ')
    expect(maskReplayText('Итого: 1 250 000 ₸', el(false))).toBe('Итого: 1 250 000 ₸')
    expect(maskReplayText('Пишите на ivan@gmail.com', el(false))).toBe('Пишите на [email]')
    expect(maskReplayText('без родителя', null)).toBe('•••')
  })
  it('адрес почты без домена верхнего уровня тоже вырезается (сообщение сервера об ошибке)', () => {
    expect(scrubText('Адрес ivan@gmial недействителен')).toBe('Адрес [email] недействителен')
  })
  it('data-атрибуты чистятся, картинки из data: и blob: убираются', () => {
    expect(maskReplayAttribute('data-email', 'ivan@mail.ru', el(false))).toBe('[email]')
    expect(maskReplayAttribute('data-total', '1 250 000', el(true))).toBe('•••')
    expect(maskReplayAttribute('src', 'data:image/gif;base64,AAAA', el(false))).toBe('')
    expect(maskReplayAttribute('src', 'blob:https://invoices.kz/abc', el(false))).toBe('')
    expect(maskReplayAttribute('src', '/og/tool-schet.png', el(false))).toBe('/og/tool-schet.png')
    expect(maskReplayAttribute('class', 'text-sm', el(true))).toBe('text-sm')
  })
  it('атрибуты: адреса чистятся, подписи в блоке с данными скрыты', () => {
    expect(maskReplayAttribute('href', '/view/abc', el(false))).toBe('/view/[token]')
    expect(maskReplayAttribute('aria-label', 'Удалить Иванов.pdf', el(true))).toBe('•••')
    expect(maskReplayAttribute('href', 'https://elicense.kz/?IinBinStr=990101300123&utm_source=ig', el(false))).toBe('https://elicense.kz/?IinBinStr=[iin]&utm_source=ig')
    expect(maskReplayAttribute('aria-label', 'Написать ivan@gmail.com', el(false))).toBe('Написать [email]')
    expect(maskReplayAttribute('class', 'ph-mask text-sm', el(true))).toBe('ph-mask text-sm')
  })
})

describe('sanitizeEvent', () => {
  it('чистит адреса в свойствах и в $set_once', () => {
    const ev = sanitizeEvent({
      event: '$pageview',
      properties: {
        $current_url: 'https://invoices.kz/view/secret?token=1',
        $pathname: '/view/secret',
        $referrer: '$direct',
        $set_once: { $initial_current_url: 'https://invoices.kz/auth/callback?code=9' },
      },
    })
    expect(ev?.properties?.$current_url).toBe('https://invoices.kz/view/[token]')
    expect(ev?.properties?.$pathname).toBe('/view/[token]')
    expect(ev?.properties?.$referrer).toBe('$direct')
    expect((ev?.properties?.$set_once as Record<string, string>).$initial_current_url).toBe('https://invoices.kz/auth/callback')
  })
  it('чистит адреса на любой глубине: метрики, стек ошибки', () => {
    const ev = sanitizeEvent({
      event: '$exception',
      properties: {
        $current_url: 'https://invoices.kz/tools',
        $web_vitals_LCP_event: { $current_url: 'https://invoices.kz/view/tok', attribution: { navigationURL: 'https://invoices.kz/view/tok?pay=1' } },
        $exception_list: [{
          type: 'Error',
          value: 'Не удалось отправить на ivan@gmail.com',
          stacktrace: { frames: [{ filename: 'https://invoices.kz/view/tok', abs_path: '/contract-view/c1' }] },
        }],
      },
    })
    const p = ev?.properties as Props
    expect((p.$web_vitals_LCP_event as Props).$current_url).toBe('https://invoices.kz/view/[token]')
    expect(((p.$web_vitals_LCP_event as Props).attribution as Props).navigationURL).toBe('https://invoices.kz/view/[token]?pay=1')
    const item = (p.$exception_list as Props[])[0]
    expect(item.value).toBe('Не удалось отправить на [email]')
    const frame = ((item.stacktrace as Props).frames as Props[])[0]
    expect(frame.filename).toBe('https://invoices.kz/view/[token]')
    expect(frame.abs_path).toBe('/contract-view/[token]')
  })
  it('не отправляет тепловые карты и мёртвые клики', () => {
    expect(sanitizeEvent({ event: '$$heatmap', properties: { $heatmap_data: { 'https://invoices.kz/view/x': [] } } })).toBeNull()
    expect(sanitizeEvent({ event: '$dead_click', properties: { $current_url: 'https://invoices.kz/tools' } })).toBeNull()
  })
  it('вне публичных страниц убирает текст нажатых элементов и заголовок страницы', () => {
    const ev = sanitizeEvent({
      event: '$autocapture',
      properties: {
        $pathname: '/clients',
        title: 'Договор с ТОО Ромашка — INVOICES.KZ',
        $el_text: 'ТОО Ромашка',
        $elements_chain: 'button.row:attr__aria-label="ТОО \\"Ромашка\\""nth-child="1"text="ТОО Ромашка";div:nth-child="2"',
        $elements: [{ tag_name: 'button', $el_text: 'ТОО Ромашка', 'attr__title': '120 000 ₸', nth_child: 1 }],
      },
    })
    expect(ev?.properties?.$el_text).toBeUndefined()
    expect(ev?.properties?.title).toBeUndefined()
    expect(ev?.properties?.$elements_chain).toBe('button.row:nth-child="1";div:nth-child="2"')
    expect(ev?.properties?.$elements).toEqual([{ tag_name: 'button', nth_child: 1 }])
  })
  it('на публичных страницах подписи кнопок и заголовок оставляет, личные данные вырезает', () => {
    const ev = sanitizeEvent({ event: '$autocapture', properties: { $current_url: 'https://invoices.kz/tools/kk', title: 'Құралдар', $el_text: 'Тегін тіркелу' } })
    expect(ev?.properties?.$el_text).toBe('Тегін тіркелу')
    expect(ev?.properties?.title).toBeUndefined()
    const typo = sanitizeEvent({ event: '$autocapture', properties: { $current_url: 'https://invoices.kz/login', $el_text: 'Отправить на ivan@gmail.com' } })
    expect(typo?.properties?.$el_text).toBe('Отправить на [email]')
  })
  it('нажатие внутри блока ph-mask: текст убран и на публичной странице', () => {
    const ev = sanitizeEvent({
      event: '$autocapture',
      properties: {
        $current_url: 'https://invoices.kz/tools/waybills',
        $el_text: 'Иванов.pdf',
        $elements_chain: 'button:attr__aria-label="Удалить Иванов.pdf"text="×";ul.space-y-0.5.ph-mask:nth-child="2"',
      },
    })
    expect(ev?.properties?.$el_text).toBeUndefined()
    expect(ev?.properties?.$elements_chain).toBe('button:;ul.space-y-0.5.ph-mask:nth-child="2"')
  })
  it('чистит ссылки в цепочке нажатых элементов', () => {
    const ev = sanitizeEvent({
      event: '$autocapture',
      properties: { $current_url: 'https://invoices.kz/', $elements_chain: 'a:attr__href="/view/abc"href="/view/abc"text="Открыть"' },
    })
    expect(ev?.properties?.$elements_chain).toBe('a:attr__href="/view/[token]"href="/view/[token]"text="Открыть"')
  })
  it('пропускает null', () => {
    expect(sanitizeEvent(null)).toBeNull()
  })
})
