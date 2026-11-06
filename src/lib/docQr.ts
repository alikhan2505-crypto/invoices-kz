import QRCode from 'qrcode'
import { validateBinIin } from './kzIdentifiers'

// QR «Проверить продавца по БИН перед оплатой» на бесплатных документах (счёт, акт, накладная, КП), 06.11.2026.
// Документ уходит другой фирме (покупателю), и у получателя появляется своя причина отсканировать: перед оплатой
// проверить, кому платить. Ведёт на бесплатную проверку контрагента с уже подставленным БИН продавца.
//
// Правила:
//  - Только для документов с бледным знаком (showWatermark: бесплатные /tools и счета с бесплатного тарифа):
//    платные тарифы остаются без нашей рекламы на документе.
//  - БИН кладём в ссылку только у юрлица (5-я цифра 4, 5 или 6). У ИП и физлица в QR нет номера: ИИН
//    человека не печатаем в ссылку, которую видит любой получатель документа (в самом документе он и так есть,
//    но ссылка уходит в историю браузера, в аналитику и в пересылку).
//  - На документе нет слов «долг есть/нет», «надёжен»: мы не гарантируем результат от своего имени, QR только ведёт на проверку.
//  - Рисуем сами SVG (QRCode.create синхронный): генераторы актов и накладных собирают HTML синхронно, а
//    картинкой data:image/svg+xml QR одинаково выходит на экране, в печати и в html2pdf.

export type DocQrKind = 'schet' | 'avr' | 'kp' | 'nakladnaya'

const SITE = 'https://invoices.kz'

/**
 * Юрлицо: 12 цифр с верной контрольной цифрой и 5-я цифра 4, 5 или 6 (ТОО, АО и т.п.). У ИП и физлиц там 0–3.
 * Контрольная цифра нужна, потому что в бесплатных /tools продавец вводит номер руками без проверки: опечатка
 * не должна увести покупателя на чужую фирму или положить чей-то ИИН в ссылку.
 */
export function isLegalEntityBin(binIin: unknown): boolean {
  const d = String(binIin ?? '').replace(/\D/g, '')
  return d.length === 12 && '456'.includes(d[4]) && validateBinIin(d) === null
}

export function docQrUrl(kind: DocQrKind, binIin?: unknown): string {
  const d = String(binIin ?? '').replace(/\D/g, '')
  const bin = isLegalEntityBin(d) ? `bin=${d}&` : ''
  return `${SITE}/tools/kontragent?${bin}utm_source=doc_qr&utm_medium=doc&utm_campaign=${kind}_qr`
}

/** SVG QR (уровень коррекции M, поля 2 модуля) в виде data: URI для <img>. */
export function docQrDataUri(text: string, color = '#1C2056'): string {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' })
  const n = qr.modules.size
  const margin = 2
  const dim = n + margin * 2
  let path = ''
  for (let y = 0; y < n; y++) {
    let x = 0
    while (x < n) {
      if (!qr.modules.get(y, x)) { x++; continue }
      const start = x
      while (x < n && qr.modules.get(y, x)) x++
      path += `M${start + margin} ${y + margin}h${x - start}v1h-${x - start}z`
    }
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges">` +
    `<rect width="${dim}" height="${dim}" fill="#fff"/><path d="${path}" fill="${color}"/></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const CAPTION: Record<'ru' | 'en', string> = {
  ru: 'Проверить продавца по БИН перед оплатой',
  en: 'Check the seller by BIN before paying',
}

/**
 * Блок QR справа под подписью. Пустая строка, если документ платный (showWatermark не включён).
 * compact: для альбомных актов и накладных (меньше по высоте, подпись слева от QR).
 * Казахская подпись не добавлена: тексты на казахском выходят только после вычитки носителем, поэтому
 * на казахских документах пока русская подпись.
 */
export function docQrHtml(on: boolean | undefined, kind: DocQrKind, binIin: unknown, opts: { lang?: string; compact?: boolean; inset?: number } = {}): string {
  if (!on) return ''
  const caption = CAPTION[opts.lang === 'en' ? 'en' : 'ru']
  const img = docQrDataUri(docQrUrl(kind, binIin))
  const href = docQrUrl(kind, binIin).replace(/&/g, '&amp;')
  if (opts.compact) {
    // Альбомные акт и накладная заполняют лист целиком (поля @page 8–10 мм): внизу места нет, блок в потоке уводил
    // подпись на вторую страницу. Свободное место есть слева в шапке, напротив «Приложение 50 / 26» (она справа):
    // QR встаёт туда и высоту строки шапки не увеличивает (блок шапки справа выше 64 px).
    return `<a class="ikz-qr" href="${href}" style="display:flex;align-items:center;gap:8px;align-self:flex-start;text-decoration:none;color:#1C2056;font:9px/1.25 Arial,Helvetica,sans-serif;">` +
      `<img src="${img}" alt="QR" style="width:64px;height:64px;display:block;">` +
      `<span style="max-width:120px;"><b>${caption}</b><br><span style="color:#667;">invoices.kz</span></span></a>`
  }
  return `<div class="ikz-qr" style="display:flex;justify-content:flex-end;margin-top:6px;padding-right:${Math.max(0, Math.round(opts.inset ?? 0))}px;page-break-inside:avoid;">` +
    `<a href="${href}" style="display:block;width:112px;text-align:center;text-decoration:none;color:#1C2056;font:9px/1.25 Arial,Helvetica,sans-serif;">` +
    `<img src="${img}" alt="QR" style="width:88px;height:88px;display:block;margin:0 auto 3px;"><b>${caption}</b>` +
    `<div style="color:#667;margin-top:2px;">invoices.kz</div></a></div>`
}
