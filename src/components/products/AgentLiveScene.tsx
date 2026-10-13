'use client'
import type { Lang } from '@/components/LanguageProvider'
import ProductArt from '@/components/products/ProductArt'
import { useSceneStep } from '@/components/products/useSceneStep'
import './kaspi-scene.css'
import './agent-scene.css'

// «Живой агент» на лендинге AI-агента — по эталону Kaspi Bot (ревизия
// 13.10.2026): то же окно, тот же моторчик кадров (useSceneStep), свой сюжет
// из двух главных функций продукта. 1) Клиент пишет в WhatsApp — агент сам
// отвечает за секунды. 2) Клиент просит счёт — агент готовит черновик,
// человек жмёт «Подтвердить», клиенту уходит PDF, выезжает сам счёт.
// Данные выдуманные. Декоративное (aria-hidden).

type Copy = {
  app: string; live: string; chatWith: string; replying: string; inMsg1: string; outMsg1: string; inMsg2: string; outMsg2: string
  pdf: string; inSec: string; channels: string; site: string; queue: string; empty: string; draft: string; buyer: string
  approve: string; edit: string; sent: string
}
const T: Record<Lang, Copy> = {
  ru: {
    app: 'AI-агент', live: 'онлайн 24/7', chatWith: 'Айгерим', replying: 'агент отвечает',
    inMsg1: 'Здравствуйте! Сколько стоит доставка в Астану?',
    outMsg1: 'Добрый день! В Астану — 1 500 ₸, 1–2 дня. Оформим заказ?',
    inMsg2: 'Да, выставьте счёт на ТОО «Арман», 2 шт.',
    outMsg2: 'Готовлю счёт — менеджер подтвердит за минуту.',
    pdf: 'Счёт № 128.pdf', inSec: 'ответ за 3 сек', channels: 'Каналы', site: 'Сайт',
    queue: 'На подтверждение', empty: 'Пока пусто', draft: 'Счёт № 128', buyer: 'ТОО «Арман»',
    approve: 'Подтвердить', edit: 'Изменить', sent: 'Отправлен клиенту',
  },
  kk: {
    app: 'AI-агент', live: 'тәулік бойы', chatWith: 'Айгерим', replying: 'агент жауап береді',
    inMsg1: 'Сәлеметсіз бе! Астанаға жеткізу қанша тұрады?',
    outMsg1: 'Қайырлы күн! Астанаға — 1 500 ₸, 1–2 күн. Тапсырыс береміз бе?',
    inMsg2: 'Иә, «Арман» ЖШС-ға шот жіберіңіз, 2 дана.',
    outMsg2: 'Шотты дайындап жатырмын — менеджер бір минутта растайды.',
    pdf: 'Шот № 128.pdf', inSec: '3 сек ішінде жауап', channels: 'Арналар', site: 'Сайт',
    queue: 'Растауды күтуде', empty: 'Әзірге бос', draft: 'Шот № 128', buyer: '«Арман» ЖШС',
    approve: 'Растау', edit: 'Өзгерту', sent: 'Клиентке жіберілді',
  },
  en: {
    app: 'AI Agent', live: 'online 24/7', chatWith: 'Aigerim', replying: 'agent replying',
    inMsg1: 'Hi! How much is delivery to Astana?',
    outMsg1: 'Hello! To Astana it is 1,500 ₸, 1–2 days. Shall I place the order?',
    inMsg2: 'Yes, please invoice Arman LLP, 2 pcs.',
    outMsg2: 'Preparing the invoice — a manager will confirm in a minute.',
    pdf: 'Invoice No. 128.pdf', inSec: 'replied in 3 sec', channels: 'Channels', site: 'Website',
    queue: 'Awaiting approval', empty: 'Nothing yet', draft: 'Invoice No. 128', buyer: 'Arman LLP',
    approve: 'Approve', edit: 'Edit', sent: 'Sent to customer',
  },
}

// Раскадровка (шаг = 1 с): 1 вопрос · 2 агент печатает · 3 ответ · 4 просьба
// о счёте · 5 печатает · 6 «готовлю» · 7 черновик справа · 8–9 курсор и нажатие
// · 10 «отправлен» · 11 PDF в чате + выезжает счёт · 12–14 пауза · 15 гаснет.
const STEPS = 16
const FINAL = 12

export default function AgentLiveScene({ lang }: { lang: Lang }) {
  const t = T[lang]
  const { step, ref } = useSceneStep(STEPS, FINAL)
  const typing = step === 2 || step === 5
  const sent = step >= 10
  const fading = step === STEPS - 1
  const wa = 12 + (step >= 1 ? 1 : 0)

  return (
    <div ref={ref} className="ks-wrap" data-theme="agent" aria-hidden="true">
      <div className="ks-win" data-fading={fading} data-reset={step === 0}>
        <div className="ks-bar">
          <i /><i /><i />
          <b>{t.app}</b>
          <span className="ks-live"><em />{t.live}</span>
        </div>

        <div className="ks-body">
          <section className="ks-card as-chatcard">
            <div className="ks-head">
              <span className="ks-title"><span className="as-wa" />WhatsApp · {t.chatWith}</span>
              <span className="as-state" data-on={typing}>{t.replying}</span>
            </div>
            <div className="as-chat">
              <Msg show={step >= 1} side="in">{t.inMsg1}</Msg>
              <Msg show={step >= 3} side="out" meta={t.inSec}>{t.outMsg1}</Msg>
              <Msg show={step >= 4} side="in">{t.inMsg2}</Msg>
              <Msg show={step >= 6} side="out">{t.outMsg2}</Msg>
              <Msg show={step >= 11} side="out" pdf>{t.pdf}</Msg>
              <span className="as-typing" data-on={typing}><i /><i /><i /></span>
            </div>
          </section>

          <section className="ks-card as-side">
            <div className="ks-head"><span className="ks-title">{t.channels}</span></div>
            <div className="as-channels">
              <span className="as-ch" data-hot={step >= 1 && step <= 6}><em style={{ background: '#2DC48D' }} />WhatsApp<b key={wa}>{wa}</b></span>
              <span className="as-ch"><em style={{ background: '#E1306C' }} />Instagram<b>5</b></span>
              <span className="as-ch"><em style={{ background: '#5B8CFF' }} />{t.site}<b>3</b></span>
            </div>

            <div className="ks-head">
              <span className="ks-title">{t.queue} <span className="ks-count" data-on={step >= 7 && !sent}>{step >= 7 && !sent ? 1 : 0}</span></span>
            </div>
            <div className="as-queue">
              <span className="ks-wait" data-on={step < 7}>{t.empty}</span>
              <div className="as-draft" data-in={step >= 7} data-sent={sent}>
                <div className="as-draft-top">
                  <span className="as-doc-ico" />
                  <span className="as-draft-name"><b>{t.draft}</b><span>{t.buyer} · 26 500 ₸</span></span>
                </div>
                {sent ? (
                  <span className="as-sent">✓ {t.sent}</span>
                ) : (
                  <div className="as-actions">
                    <span className="ks-btnwrap">
                      <span className="ks-btn" data-press={step === 9}>{t.approve}</span>
                      <span className="ks-cursor" data-at={step === 8 ? 'near' : step === 9 ? 'btn' : 'off'}>
                        <svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 3l14 8-6 1.6L10.5 19z" fill="#1D1140" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" /></svg>
                      </span>
                    </span>
                    <span className="as-ghost">{t.edit}</span>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Два пузыря диалога (та же картинка, что на плитке хаба) — у угла окна,
          размером как коробка у Kaspi Bot. */}
      <span className="ks-box as-bubbles" data-shake={step === 11}><ProductArt product="aiAgent" /></span>

      <div className="ks-label as-label" data-in={step >= 11 && !fading}>
        <InvoiceDoc />
      </div>
    </div>
  )
}

function Msg({ show, side, meta, pdf, children }: { show: boolean; side: 'in' | 'out'; meta?: string; pdf?: boolean; children: React.ReactNode }) {
  return (
    <div className="as-msg" data-side={side} data-in={show} data-pdf={!!pdf}>
      {pdf && <span className="as-pdf-ico">PDF</span>}
      <span className="as-text">{children}</span>
      {meta && <span className="as-meta">{meta}</span>}
    </div>
  )
}

// Мини-копия счёта на оплату, как его делает invoices.kz (формат А4).
// Данные выдуманные; документ всегда на русском — как настоящий.
function InvoiceDoc() {
  return (
    <div className="ks-a6 as-doc">
      <div className="as-doc-warn">Внимание! Оплата данного счёта означает согласие с условиями поставки товара.</div>
      <table className="as-doc-bank"><tbody>
        <tr><td>Бенефициар: ИП «ВАШ МАГАЗИН»<br />БИН 900101300123</td><td>ИИК<br /><b>KZ12 722S 0000 1234 5678</b></td><td>Кбе<br /><b>19</b></td></tr>
      </tbody></table>
      <div className="as-doc-title">Счёт на оплату № 128 от 16 октября 2026 г.</div>
      <div className="as-doc-party"><span>Поставщик:</span> ИП «ВАШ МАГАЗИН», г. Алматы</div>
      <div className="as-doc-party"><span>Покупатель:</span> ТОО «АРМАН», БИН 150240012345</div>
      <table className="as-doc-items"><tbody>
        <tr><th>№</th><th>Наименование</th><th>Кол.</th><th>Сумма</th></tr>
        <tr><td>1</td><td>Кресло офисное</td><td>2</td><td>25 000</td></tr>
        <tr><td>2</td><td>Доставка в Астану</td><td>1</td><td>1 500</td></tr>
      </tbody></table>
      <div className="as-doc-total">Итого: <b>26 500 ₸</b></div>
      <div className="as-doc-words">Двадцать шесть тысяч пятьсот тенге 00 тиын</div>
      <div className="as-doc-sign"><span>Исполнитель ______</span><span className="as-doc-stamp">ИП<br />ВАШ МАГАЗИН</span></div>
    </div>
  )
}
