'use client'
import type { Lang } from '@/components/LanguageProvider'
import ProductArt from '@/components/products/ProductArt'
import { useSceneStep } from '@/components/products/useSceneStep'
import './kaspi-scene.css'
import './agent-scene.css'
import './salon-scene.css'

// «Живой планировщик» на лендинге Салона — по эталону Kaspi Bot (13.10.2026):
// то же окно и моторчик кадров, свой сюжет из трёх обещаний лендинга.
// 1) Клиентка пишет в WhatsApp «можно на маникюр завтра в 15:00?» —
// 2) запись приходит владельцу черновиком, он жмёт «Подтвердить», и она
// встаёт в календарь мастера; 3) у клиентки видна история — «5-й визит,
// Постоянная». В конце выезжает телефон с сайтом салона. Данные выдуманные.

type Copy = {
  app: string; day: string; chatWith: string; inMsg: string; outMsg: string; queue: string; empty: string
  draftWhat: string; draftWho: string; approve: string; other: string; booked: string; visit: string; regular: string; remind: string
  services: Record<'mani' | 'pedi' | 'cut' | 'color' | 'brows', string>
}
const T: Record<Lang, Copy> = {
  ru: {
    app: 'Салон · Записи', day: 'Пт, 17 октября', chatWith: 'Алия',
    inMsg: 'Здравствуйте! Можно на маникюр завтра в 15:00?', outMsg: 'Записали вас к Айгуль на 15:00. Ждём!',
    queue: 'На подтверждение', empty: 'Пока пусто', draftWhat: 'Маникюр · Айгуль · 15:00', draftWho: 'Алия · из WhatsApp',
    approve: 'Подтвердить', other: 'Другое время', booked: 'Записана', visit: '5-й визит', regular: 'Постоянная', remind: 'Напомним за 2 часа',
    services: { mani: 'Маникюр', pedi: 'Педикюр', cut: 'Стрижка', color: 'Окрашивание', brows: 'Брови' },
  },
  kk: {
    app: 'Салон · Жазылулар', day: 'Жм, 17 қазан', chatWith: 'Әлия',
    inMsg: 'Сәлеметсіз бе! Ертең 15:00-ге маникюрге жазылуға бола ма?', outMsg: 'Сізді Айгүлге 15:00-ге жаздық. Күтеміз!',
    queue: 'Растауды күтуде', empty: 'Әзірге бос', draftWhat: 'Маникюр · Айгүл · 15:00', draftWho: 'Әлия · WhatsApp-тан',
    approve: 'Растау', other: 'Басқа уақыт', booked: 'Жазылды', visit: '5-ші келуі', regular: 'Тұрақты', remind: '2 сағат бұрын еске саламыз',
    services: { mani: 'Маникюр', pedi: 'Педикюр', cut: 'Шаш қию', color: 'Бояу', brows: 'Қас' },
  },
  en: {
    app: 'Salon · Bookings', day: 'Fri, 17 October', chatWith: 'Aliya',
    inMsg: 'Hi! Can I book a manicure tomorrow at 3 pm?', outMsg: 'You are booked with Aigul at 3 pm. See you!',
    queue: 'Awaiting approval', empty: 'Nothing yet', draftWhat: 'Manicure · Aigul · 15:00', draftWho: 'Aliya · via WhatsApp',
    approve: 'Approve', other: 'Other time', booked: 'Booked', visit: '5th visit', regular: 'Regular', remind: 'Reminder 2 h before',
    services: { mani: 'Manicure', pedi: 'Pedicure', cut: 'Haircut', color: 'Coloring', brows: 'Brows' },
  },
}

const MASTERS: { name: Record<Lang, string>; tone: string }[] = [
  { name: { ru: 'Айгуль', kk: 'Айгүл', en: 'Aigul' }, tone: '#F9D2E0' },
  { name: { ru: 'Дана', kk: 'Дана', en: 'Dana' }, tone: '#E6DAFF' },
  { name: { ru: 'Мира', kk: 'Мира', en: 'Mira' }, tone: '#FFE4C7' },
]
// Уже стоящие записи: мастер, начало (часы от 10:00), длительность (ч), услуга, клиент.
const BOOKED: { m: number; at: number; len: number; s: keyof Copy['services']; who: Record<Lang, string> }[] = [
  { m: 0, at: 0, len: 1.5, s: 'mani', who: { ru: 'Динара', kk: 'Динара', en: 'Dinara' } },
  { m: 0, at: 2, len: 1, s: 'pedi', who: { ru: 'Жанна', kk: 'Жанна', en: 'Zhanna' } },
  { m: 1, at: 0.5, len: 1.5, s: 'cut', who: { ru: 'Ерлан', kk: 'Ерлан', en: 'Erlan' } },
  { m: 1, at: 3, len: 2, s: 'color', who: { ru: 'Сауле', kk: 'Сәуле', en: 'Saule' } },
  { m: 2, at: 1, len: 1, s: 'brows', who: { ru: 'Камила', kk: 'Камила', en: 'Kamila' } },
  { m: 2, at: 4, len: 1, s: 'brows', who: { ru: 'Асель', kk: 'Әсел', en: 'Asel' } },
]
const HOURS = ['10', '11', '12', '13', '14', '15', '16']

// Раскадровка (шаг = 1 с): 1 сообщение · 2 печатает · 3 черновик + пунктир в
// календаре · 4–5 курсор и нажатие · 6 запись встаёт в календарь · 7 ответ
// клиентке · 8 «5-й визит, Постоянная» · 9 напоминание · 10 выезжает сайт ·
// 11–14 пауза · 15 гаснет.
const STEPS = 16
const FINAL = 12

export default function SalonLiveScene({ lang }: { lang: Lang }) {
  const t = T[lang]
  const { step, ref } = useSceneStep(STEPS, FINAL)
  const booked = step >= 6
  const fading = step === STEPS - 1

  return (
    <div ref={ref} className="ks-wrap" data-theme="salon" aria-hidden="true">
      <div className="ks-win" data-fading={fading} data-reset={step === 0}>
        <div className="ks-bar">
          <i /><i /><i />
          <b>{t.app}</b>
          <span className="ks-live"><em />{t.day}</span>
        </div>

        <div className="ks-body">
          <section className="ks-card sl-cal-card">
            <div className="sl-masters">
              <span />
              {MASTERS.map((m) => (
                <span key={m.name.ru} className="sl-master"><i style={{ background: m.tone }}>{m.name[lang][0]}</i>{m.name[lang]}</span>
              ))}
            </div>
            <div className="sl-grid">
              {HOURS.map((h, i) => <span key={h} className="sl-hour" style={{ top: `${i * 34}px` }}>{h}:00</span>)}
              {BOOKED.map((b) => (
                <span key={`${b.m}-${b.at}`} className="sl-slot" style={{ ...slotPos(b.m, b.at, b.len), background: MASTERS[b.m].tone }}>
                  <b>{t.services[b.s]}</b><span>{b.who[lang]}</span>
                </span>
              ))}
              {/* новая запись: сначала пунктир «ждёт подтверждения», потом встаёт */}
              <span className="sl-slot sl-new" data-state={booked ? 'booked' : step >= 3 ? 'pending' : 'off'} style={slotPos(0, 5, 1.5)}>
                <b>{t.services.mani}</b><span>{t.chatWith}</span>
              </span>
              <span className="sl-client" data-in={step >= 8}>
                <i>{t.chatWith[0]}</i>
                <span><b>{t.chatWith} · {t.visit}</b><em>★ {t.regular}</em></span>
              </span>
            </div>
          </section>

          <section className="ks-card sl-side">
            <div className="ks-head"><span className="ks-title"><span className="as-wa" />WhatsApp · {t.chatWith}</span></div>
            <div className="as-chat sl-chat">
              <div className="as-msg" data-side="in" data-in={step >= 1}><span className="as-text">{t.inMsg}</span></div>
              <div className="as-msg" data-side="out" data-in={step >= 7}><span className="as-text">{t.outMsg}</span><span className="as-meta">{t.remind}</span></div>
              <span className="as-typing" data-on={step === 2}><i /><i /><i /></span>
            </div>

            <div className="ks-head">
              <span className="ks-title">{t.queue} <span className="ks-count" data-on={step >= 3 && !booked}>{step >= 3 && !booked ? 1 : 0}</span></span>
            </div>
            <div className="as-queue">
              <span className="ks-wait" data-on={step < 3}>{t.empty}</span>
              <div className="as-draft" data-in={step >= 3} data-sent={booked}>
                <div className="as-draft-top">
                  <span className="sl-clock">15:00</span>
                  <span className="as-draft-name"><b>{t.draftWhat}</b><span>{t.draftWho}</span></span>
                </div>
                {booked ? (
                  <span className="as-sent">✓ {t.booked}</span>
                ) : (
                  <div className="as-actions">
                    <span className="ks-btnwrap">
                      <span className="ks-btn" data-press={step === 5}>{t.approve}</span>
                      <span className="ks-cursor" data-at={step === 4 ? 'near' : step === 5 ? 'btn' : 'off'}>
                        <svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 3l14 8-6 1.6L10.5 19z" fill="#3B1030" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" /></svg>
                      </span>
                    </span>
                    <span className="as-ghost">{t.other}</span>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Календарь «15:00» (та же картинка, что на плитке хаба) — у угла окна. */}
      <span className="ks-box sl-art" data-shake={step === 6}><ProductArt product="salon" /></span>

      <div className="ks-label sl-label" data-in={step >= 10 && !fading}>
        <SalonSitePhone />
      </div>
    </div>
  )
}

// Позиция записи в сетке: 3 колонки мастеров после колонки часов, 34px на час.
function slotPos(master: number, at: number, len: number): React.CSSProperties {
  return {
    left: `calc(42px + (100% - 42px) / 3 * ${master} + 3px)`,
    width: 'calc((100% - 42px) / 3 - 6px)',
    top: `${at * 34 + 8}px`,
    height: `${len * 34 - 4}px`,
  }
}

// Телефон с сайтом салона (такие собирает наш генератор сайтов салонов) —
// выезжает в финале: «и сайт салона». Салон выдуманный.
function SalonSitePhone() {
  return (
    <div className="ks-a6 sl-phone">
      <div className="sl-ph-notch" />
      <div className="sl-ph-hero">
        <span className="sl-ph-logo">Aru Studio</span>
        <b>Маникюр, брови и стрижки в центре Алматы</b>
        <span className="sl-ph-cta">Записаться в WhatsApp</span>
      </div>
      <div className="sl-ph-list">
        <span><i>Маникюр с покрытием</i><b>9 000 ₸</b></span>
        <span><i>Стрижка женская</i><b>8 000 ₸</b></span>
        <span><i>Коррекция бровей</i><b>5 000 ₸</b></span>
      </div>
      <div className="sl-ph-rating">★★★★★ <span>4,9 · 2ГИС</span></div>
    </div>
  )
}
