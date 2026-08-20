import type { ReactNode } from 'react'
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

export default function AiAgentDocsPage() {
  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="max-w-5xl mx-auto px-4 lg:px-6 py-8 pb-24">
        <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--nav-text-primary)', letterSpacing: '-0.02em' }}>
          Как настроить AI-агента
        </h1>
        <p className="text-sm mb-8" style={{ color: 'var(--nav-text-secondary)' }}>
          Пошаговый курс: от создания агента до первых автоматических ответов вашим клиентам в Instagram.
        </p>

        <Lesson n={1} title="Что умеет AI-агент">
          <P>
            AI-агент — это ваш виртуальный сотрудник, который отвечает клиентам в Instagram Direct и на комментарии
            под постами от имени вашего бизнеса. Он работает круглосуточно, отвечает на языке клиента
            (русский, казахский, английский) и умеет:
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

        <Lesson n={3} title="Подключение Instagram">
          <LessonStep n={1} title="Нужен бизнес-аккаунт Instagram">
            Личный профиль не подойдёт — переключите его на бизнес-аккаунт в настройках Instagram (это бесплатно).
          </LessonStep>
          <LessonStep n={2} title="Нажмите «Подключить Instagram» в настройках агента">
            Откроется официальное окно входа Meta — мы не видим и не храним ваш пароль.
          </LessonStep>
          <LessonStep n={3} title="Разрешите доступ к сообщениям">
            Подтвердите разрешения — после этого агент начнёт получать новые сообщения и комментарии.
          </LessonStep>
          <Hint>
            Если подключение слетело (пароль менялся, доступ отозван) — в настройках появится кнопка
            «Переподключить Instagram». Диалоги и настройки при этом не теряются.
          </Hint>
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
            На странице «Агенты» можно создать несколько агентов — например, отдельного под каждый
            Instagram-аккаунт или направление бизнеса. У каждого свои настройки, подключения и диалоги.
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
