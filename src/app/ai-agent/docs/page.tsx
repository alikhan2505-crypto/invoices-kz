'use client'
import { useState, type ReactNode } from 'react'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'

// Text-first onboarding for the AI-агент section (2026-08-20, founder:
// "сделать онбординг через видеокурсы (пока текстовый Документацию написать
// можно)"). Lesson structure mirrors the competitor's video-course topics;
// swapping any lesson for a real video later is a drop-in replacement.

function LessonStep({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-4">
      <div
        className="w-8 h-8 rounded-full text-sm font-bold flex items-center justify-center flex-shrink-0"
        style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}
      >
        {n}
      </div>
      <div className="flex-1 pb-6">
        <div className="font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>{title}</div>
        <div className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>{children}</div>
      </div>
    </div>
  )
}

function Lesson({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="mb-8 nav-glass nav-card-accent rounded-2xl p-6">
      <div className="text-[11px] font-extrabold uppercase mb-1" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.08em' }}>
        Урок {n}
      </div>
      <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--nav-text-primary)' }}>{title}</h2>
      {children}
    </section>
  )
}

function P({ children }: { children: ReactNode }) {
  return <p className="text-sm mb-3" style={{ color: 'var(--nav-text-secondary)' }}>{children}</p>
}

function Hint({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl p-4 mt-2 text-sm" style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-secondary)' }}>
      {children}
    </div>
  )
}

// Урок 3 content, one entry per real connectable channel (mirrors the
// actual Каналы tab in /ai-agent/settings — Instagram OAuth, Telegram
// bot-token, WhatsApp Embedded Signup, website <script> snippet). Kept as
// data rather than inline JSX so the tile switcher below stays a plain map.
type ChannelKey = 'instagram' | 'telegram' | 'whatsapp' | 'website' | 'api'
const CHANNELS: { key: ChannelKey; label: string; steps: { title: string; body: string }[]; hint: string }[] = [
  {
    key: 'instagram',
    label: 'Instagram',
    steps: [
      { title: 'Нужен бизнес-аккаунт Instagram', body: 'Личный профиль не подойдёт — переключите его на бизнес-аккаунт в настройках Instagram (это бесплатно).' },
      { title: 'Нажмите «Подключить Instagram» в настройках агента', body: 'Откроется официальное окно входа Meta — мы не видим и не храним ваш пароль.' },
      { title: 'Разрешите доступ к сообщениям', body: 'Подтвердите разрешения — после этого агент начнёт получать новые сообщения и комментарии.' },
    ],
    hint: 'Если подключение слетело (пароль менялся, доступ отозван) — в настройках появится кнопка «Переподключить Instagram». Диалоги и настройки при этом не теряются.',
  },
  {
    key: 'telegram',
    label: 'Telegram',
    steps: [
      { title: 'Создайте бота через @BotFather', body: 'В Telegram напишите @BotFather, отправьте команду /newbot, придумайте имя и юзернейм — в ответ придёт токен бота.' },
      { title: 'Вставьте токен в настройках агента', body: 'На вкладке «Каналы» нажмите «Подключить Telegram» и вставьте скопированный токен целиком.' },
      { title: 'Готово — агент отвечает сразу', body: 'Как только токен принят, бот начинает получать сообщения от ваших клиентов в Telegram.' },
    ],
    hint: 'Токен — это пароль от бота, никому его не показывайте. Если он всё же попал не в те руки — создайте нового бота через @BotFather и подключите заново.',
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    steps: [
      { title: 'Нужен номер WhatsApp Business', body: 'Подойдёт как совсем новый номер, так и уже используемый в обычном приложении WhatsApp Business.' },
      { title: 'Нажмите «Подключить WhatsApp» в настройках агента', body: 'Откроется официальное окно Meta — привяжете свой аккаунт Meta Business и выберете номер.' },
      { title: 'Подтвердите номер и разрешения', body: 'После подтверждения агент начнёт отвечать через официальный WhatsApp Cloud API.' },
    ],
    hint: 'Если номер уже установлен в обычном приложении WhatsApp Business — это правило Meta, не наше ограничение.',
  },
  {
    key: 'website',
    label: 'Сайт',
    steps: [
      { title: 'Скопируйте код виджета', body: 'На вкладке «Каналы» → «Чат для сайта» скопируйте готовый <script>-тег.' },
      { title: 'Вставьте его на свой сайт', body: 'Перед закрывающим тегом </body> на любой странице, где хотите видеть чат.' },
      { title: 'Готово — на сайте появится кнопка чата', body: 'Посетители смогут писать агенту прямо с вашего сайта, без установки приложений.' },
    ],
    hint: 'Виджет работает на любом сайте — не важно, на чём он сделан. Обновлять код при изменении настроек агента не нужно.',
  },
  {
    key: 'api',
    label: 'API',
    steps: [
      { title: 'Сгенерируйте ключ API', body: 'На вкладке «Каналы» → «API» нажмите «Подключить» — ключ покажется один раз, сразу скопируйте его.' },
      { title: 'Отправляйте сообщения клиента', body: 'POST-запрос на /api/ai-agent/external/message с заголовком Authorization: Bearer <ключ> — так ваша система передаёт агенту, что написал клиент.' },
      { title: 'Забирайте ответы агента', body: 'GET-запрос на /api/ai-agent/external/messages с тем же ключом — ваша система опрашивает его и показывает ответ клиенту в своём интерфейсе.' },
    ],
    hint: 'Для своей CRM, приложения или самописного сайта — когда встроенный виджет или готовые каналы не подходят. Ключ — как пароль: если он попал не в те руки, перегенерируйте его в настройках, старый сразу перестанет работать.',
  },
]

function ChannelSwitcher() {
  const [active, setActive] = useState<ChannelKey>('instagram')
  const channel = CHANNELS.find(c => c.key === active)!
  return (
    <div>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-6">
        {CHANNELS.map(c => {
          const isActive = c.key === active
          return (
            <button key={c.key} onClick={() => setActive(c.key)}
              className="text-sm px-3 py-2.5 rounded-lg font-medium transition-colors"
              style={isActive
                ? { background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }
                : { background: 'var(--nav-bg)', color: 'var(--nav-text-secondary)' }}>
              {c.label}
            </button>
          )
        })}
      </div>
      {channel.steps.map((step, i) => (
        <LessonStep key={step.title} n={i + 1} title={step.title}>{step.body}</LessonStep>
      ))}
      <Hint>{channel.hint}</Hint>
    </div>
  )
}

export default function AiAgentDocsPage() {
  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
      <SiteNav />
      <div className="max-w-5xl mx-auto px-4 lg:px-6 py-8">
        <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--nav-text-primary)', letterSpacing: '-0.02em' }}>
          Как настроить AI-агента
        </h1>
        <p className="text-sm mb-8" style={{ color: 'var(--nav-text-secondary)' }}>
          Пошаговый курс: от создания агента до первых автоматических ответов вашим клиентам в Instagram, Telegram, WhatsApp, на сайте и через API.
        </p>

        <Lesson n={1} title="Что умеет AI-агент">
          <P>
            AI-агент — это ваш виртуальный сотрудник, который отвечает клиентам в Instagram (Direct и комментарии),
            Telegram, WhatsApp, в чат-виджете на вашем сайте или через API в вашей собственной системе — от имени
            вашего бизнеса. Он работает круглосуточно,
            отвечает на языке клиента (русский, казахский, английский) и умеет:
          </P>
          <ul className="list-disc list-inside text-sm space-y-1 mb-3" style={{ color: 'var(--nav-text-secondary)' }}>
            <li>отвечать на вопросы о ваших товарах и услугах;</li>
            <li>квалифицировать заявки — понять, что нужно клиенту, и собрать контакты;</li>
            <li>записывать на консультацию или приём;</li>
            <li>собирать нужные вам данные: имя, телефон, город, бюджет и любые свои поля.</li>
          </ul>
          <Hint>
            <strong style={{ color: 'var(--nav-text-primary)' }}>Сколько это стоит:</strong> каждый ответ агента — 5 ₸,
            списывается с единого баланса кошелька (иконка ₸ в правом верхнем углу). Пока баланс пополнен, агент
            отвечает без ограничений.
          </Hint>
        </Lesson>

        <Lesson n={2} title="Создание агента за 2 минуты">
          <LessonStep n={1} title="Откройте раздел AI-агент → Настройки">
            Укажите название компании — агент будет представляться от её имени.
          </LessonStep>
          <LessonStep n={2} title="Выберите формат общения">
            Четыре стиля: дружелюбный, профессиональный, энергичный или заботливый. Это задаёт тон каждого ответа.
          </LessonStep>
          <LessonStep n={3} title="Опишите бизнес своими словами">
            Чем подробнее расскажете, что вы продаёте, какие цены, условия доставки и частые вопросы клиентов —
            тем точнее агент будет отвечать. Это его единственный источник знаний о вас.
          </LessonStep>
          <LessonStep n={4} title="Выберите цель и данные для сбора">
            Основная цель определяет стратегию диалога, а галочки «какие данные собрать» — что агент аккуратно
            выяснит у клиента по ходу разговора (по одному вопросу за раз, без анкет).
          </LessonStep>
          <LessonStep n={5} title="Нажмите «Создать агента»">
            Через несколько секунд агент будет готов. Часовой пояс и валюта уже настроены на Казахстан.
          </LessonStep>
        </Lesson>

        <Lesson n={3} title="Подключение каналов">
          <P>
            У агента пять каналов — подключите любой из них или все сразу, каждый настраивается отдельно на
            вкладке «Каналы».
          </P>
          <ChannelSwitcher />
        </Lesson>

        <Lesson n={4} title="Режим обучения: проверяйте ответы перед отправкой">
          <P>
            Новый агент начинает в режиме обучения: его ответы не уходят клиенту сразу, а попадают в раздел
            «Диалоги» на проверку. Вы читаете черновик, при необходимости правите и подтверждаете отправку.
          </P>
          <P>
            Так вы контролируете качество на старте и видите, как агент понимает ваш бизнес. Когда ответы
            стабильно хорошие, агент переходит в автоматический режим и отвечает сам — мгновенно.
          </P>
          <Hint>
            Совет: первые дни заглядывайте в «Диалоги» пару раз в день. Если агент отвечает не так — уточните
            описание бизнеса в настройках: это сразу влияет на все следующие ответы.
          </Hint>
        </Lesson>

        <Lesson n={5} title="Несколько агентов и удаление">
          <P>
            На странице «Агенты» можно создать несколько агентов — например, отдельного под каждое направление
            бизнеса или под каждый подключённый канал. У каждого свои настройки, подключения и диалоги.
          </P>
          <P>
            Удаление агента — безвозвратное: стираются его настройки, подключения и вся история диалогов.
            Для защиты от случайного клика нужно ввести название агента в подтверждение.
          </P>
        </Lesson>

        <Lesson n={6} title="Баланс и оплата">
          <P>
            Агент расходует единый кошелёк invoices.kz: 5 ₸ за каждый отправленный ответ. Пополнить баланс можно
            в кошельке (значок ₸ вверху справа) через Kaspi QR — деньги зачисляются автоматически за минуту.
          </P>
          <P>
            В кошельке видно, сколько потратил именно ИИ-агент за последние 30 дней, и на сколько дней хватит
            текущего баланса при вашем темпе.
          </P>
        </Lesson>

        <section>
          <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--nav-text-primary)' }}>Поддержка</h2>
          <p className="mb-3 text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
            Остались вопросы по настройке агента? Напишите нам:
          </p>
          <div className="flex flex-wrap gap-3">
            <a href="mailto:support@invoices.kz" className="rounded-lg px-3 py-1.5 text-sm font-medium" style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-accent)' }}>
              support@invoices.kz
            </a>
            <a href="https://t.me/invoiceskz_support" target="_blank" rel="noopener noreferrer" className="rounded-lg px-3 py-1.5 text-sm font-medium" style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-accent)' }}>
              Telegram
            </a>
          </div>
        </section>
      </div>
    </main>
    </DesktopShell>
  )
}
