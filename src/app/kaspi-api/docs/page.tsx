import type { ReactNode } from 'react'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'

function QuickStartStep({ n, title, children }: { n: number; title: string; children: ReactNode }) {
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

// Inline code chip -- used throughout for endpoint paths, field names, route
// references. One shared style instead of ad-hoc bg-gray-100 per instance.
function Code({ children }: { children: ReactNode }) {
  return (
    <code className="px-1.5 py-0.5 rounded" style={{ background: 'var(--nav-border-soft)', color: 'var(--nav-text-primary)' }}>
      {children}
    </code>
  )
}

function CodeBlock({ children }: { children: ReactNode }) {
  return (
    <pre
      className="nav-glass rounded-xl p-3 overflow-x-auto text-sm"
      style={{ color: 'var(--nav-text-primary)' }}
    >
      {children}
    </pre>
  )
}

function InfoBlock({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--nav-surface-glass)' }}>
      {children}
    </div>
  )
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full mb-2"
      style={{ background: 'var(--nav-critical)', color: '#fff' }}
    >
      {children}
    </span>
  )
}

export default function KaspiApiDocsPage() {
  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="max-w-5xl mx-auto px-4 lg:px-6 py-8 pb-24">
        <h1 className="text-3xl font-bold mb-8" style={{ color: 'var(--nav-text-primary)', letterSpacing: '-0.02em' }}>
          API документация Kaspi API
        </h1>

        <section className="mb-10 nav-glass nav-card-accent rounded-2xl p-6">
          <h2 className="text-2xl font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>
            Быстрый старт: приём оплаты на вашем сайте
          </h2>
          <p className="text-sm mb-6" style={{ color: 'var(--nav-text-secondary)' }}>
            Эти шаги нужно пройти один раз, чтобы ваш сайт, приложение или бот сами создавали ссылки на оплату Kaspi
            и узнавали, когда клиент оплатил — без вашего участия в каждой оплате.
          </p>

          <div>
            <QuickStartStep n={1} title="Подключите роль «Кассир»">
              На странице <Code>/kaspi-api</Code> введите номер
              телефона, на котором в приложении Kaspi Pay уже выдана роль «Кассир», и подтвердите код из SMS.
            </QuickStartStep>
            <QuickStartStep n={2} title="Сохраните API-токен и webhook-секрет">
              Сразу после подключения на этой же странице один раз покажутся два значения: API-токен (для запросов к
              API) и отдельный webhook-секрет (для проверки подписи вебхуков, см. ниже). Скопируйте и сохраните оба —
              второй раз они не показываются (можно только отключить кассира и подключить заново, тогда выдадутся новые).
            </QuickStartStep>
            <QuickStartStep n={3} title="Передайте их разработчику или вставьте в свой сайт">
              Если сайт делаете не вы сами — отправьте эти два значения и ссылку на этот документ вашему разработчику.
              Всё, что нужно на вашей стороне — один HTTP-запрос ниже.
            </QuickStartStep>
            <QuickStartStep n={4} title="Создайте платёж">
              Ваш сайт отправляет запрос из раздела «Пример запроса (curl)» ниже, указав сумму и свой номер заказа.
              В ответе придёт ссылка/QR — покажите её клиенту.
            </QuickStartStep>
            <QuickStartStep n={5} title="Узнайте об оплате автоматически">
              Проще всего — periодически спрашивать статус (раздел «Проверка статуса платежа» ниже), пока клиент на
              странице оплаты. Если у вас есть свой сервер — можно вместо этого настроить вебхук (раздел «Вебхуки» ниже),
              и мы сами пришлём уведомление.
            </QuickStartStep>
          </div>

          <div className="rounded-xl p-4 mt-2" style={{ background: 'var(--nav-surface-glass)' }}>
            <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
              <strong style={{ color: 'var(--nav-text-primary)' }}>Сколько это стоит:</strong> подключение и приём платежей — бесплатно на
              любом тарифе. Комиссия 2% списывается с баланса вашего кошелька только с подтверждённых оплат — например,
              с платежа на 10 000 ₸ спишется 200 ₸. Баланс пополняется заранее на той же странице подключения; пока на
              балансе достаточно средств, оплату можно принимать без ограничений.
            </p>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--nav-text-primary)' }}>Получение API токена и webhook-секрета</h2>
          <p className="mb-4" style={{ color: 'var(--nav-text-secondary)' }}>
            При подключении Kaspi Pay к вашему аккаунту на invoices.kz вам будет выдан уникальный API токен и отдельный
            webhook-секрет. Оба отображаются один раз при подключении в разделе{' '}
            <Code>/kaspi-api</Code>.
            Сохраните оба в безопасном месте — токен понадобится для всех запросов к API, секрет — для проверки подписи
            входящих вебхуков (см. ниже). Они принадлежат только вашему подключению — ни с кем не переиспользуются.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--nav-text-primary)' }}>Создание платежа</h2>
          <p className="mb-4" style={{ color: 'var(--nav-text-secondary)' }}>
            Для создания платежа выполните POST запрос к нашему API:
          </p>

          <InfoBlock>
            <p className="font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>Endpoint:</p>
            <code style={{ color: 'var(--nav-accent)' }}>POST https://www.invoices.kz/api/kaspi/pay</code>
          </InfoBlock>

          <InfoBlock>
            <p className="font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>Заголовок аутентификации:</p>
            <code className="text-sm" style={{ color: 'var(--nav-text-primary)' }}>Authorization: Bearer &lt;ваш_api_токен&gt;</code>
          </InfoBlock>

          <InfoBlock>
            <p className="font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>Тело запроса (JSON):</p>
            <CodeBlock>
{`{
  "amount": 10000,
  "order_id": "order_12345",
  "callback_url": "https://example.com/webhook/kaspi"
}`}
            </CodeBlock>
            <div className="mt-4 text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
              <p className="font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>Параметры:</p>
              <ul className="list-disc list-inside space-y-1">
                <li><Code>amount</Code> (обязательно) — сумма платежа в тенге (число)</li>
                <li><Code>order_id</Code> (обязательно) — уникальный идентификатор заказа (строка)</li>
                <li>
                  <Code>callback_url</Code> (опционально) — URL вашего вебхука для уведомлений об успешном платеже
                </li>
              </ul>
            </div>
          </InfoBlock>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--nav-text-primary)' }}>Ответ API</h2>
          <p className="mb-4" style={{ color: 'var(--nav-text-secondary)' }}>
            При успешном запросе вы получите ответ со статусом 200:
          </p>

          <InfoBlock>
            <CodeBlock>
{`{
  "qr_token": "eyJhbGc...",
  "payment_link": "https://kaspi.kz/pay/...",
  "operation_id": "op_123456789",
  "expire_date": "2024-12-31T23:59:59Z"
}`}
            </CodeBlock>
            <div className="mt-4 text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
              <p className="font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>Поля ответа:</p>
              <ul className="list-disc list-inside space-y-1">
                <li><Code>qr_token</Code> — токен для отображения QR кода платежа</li>
                <li><Code>payment_link</Code> — ссылка для платежа (может быть передана клиентам)</li>
                <li><Code>operation_id</Code> — уникальный идентификатор операции на стороне Kaspi</li>
                <li><Code>expire_date</Code> — дата и время истечения QR кода</li>
              </ul>
            </div>
          </InfoBlock>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--nav-text-primary)' }}>Проверка статуса платежа</h2>
          <p className="mb-4" style={{ color: 'var(--nav-text-secondary)' }}>
            Kaspi не присылает нам уведомление о том, что QR оплачен — мы сами должны спросить у Kaspi.
            Самый быстрый способ узнать, что платёж прошёл — спросить у нас напрямую, пока клиент ещё на странице оплаты:
          </p>

          <InfoBlock>
            <p className="font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>Endpoint:</p>
            <code style={{ color: 'var(--nav-accent)' }}>GET https://www.invoices.kz/api/kaspi/pay/status?operation_id=op_123456789</code>
          </InfoBlock>

          <InfoBlock>
            <p className="font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>Заголовок аутентификации:</p>
            <code className="text-sm" style={{ color: 'var(--nav-text-primary)' }}>Authorization: Bearer &lt;ваш_api_токен&gt;</code>
          </InfoBlock>

          <InfoBlock>
            <p className="font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>Ответ (JSON):</p>
            <CodeBlock>
{`{
  "operation_id": "op_123456789",
  "order_id": "order_12345",
  "amount": 10000,
  "status": "paid",
  "paid": true
}`}
            </CodeBlock>
            <div className="mt-4 text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
              <p className="font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>Значения <Code>status</Code>:</p>
              <ul className="list-disc list-inside space-y-1">
                <li><Code>pending</Code> — ожидает оплаты</li>
                <li><Code>paid</Code> — оплачен</li>
                <li><Code>expired</Code> — QR истёк без оплаты</li>
              </ul>
            </div>
          </InfoBlock>

          <p className="mb-4" style={{ color: 'var(--nav-text-secondary)' }}>
            Каждый вызов этого эндпоинта запускает реальную проверку у Kaspi (не просто читает нашу базу), поэтому
            опрашивать его можно, например, раз в несколько секунд, пока клиент ждёт оплаты на вашей странице —
            так же делает и наша собственная страница счёта.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--nav-text-primary)' }}>Вебхуки (webhook)</h2>
          <p className="mb-4" style={{ color: 'var(--nav-text-secondary)' }}>
            Если вы указали <Code>callback_url</Code> при создании платежа,
            мы отправим уведомление об успешном платеже POST запросом на этот URL.
          </p>

          <div className="nav-glass rounded-xl p-4 mb-4">
            <Badge>⚠️ Важно</Badge>
            <ul className="text-sm space-y-2" style={{ color: 'var(--nav-text-secondary)' }}>
              <li>
                <strong style={{ color: 'var(--nav-text-primary)' }}>HTTPS обязателен:</strong> callback_url должен начинаться с <Code>https://</Code>
              </li>
              <li>
                <strong style={{ color: 'var(--nav-text-primary)' }}>Не localhost/частные сети:</strong> URL не должен указывать на localhost, 192.168.x.x, 10.x.x.x, 172.16–31.x.x или другие приватные адреса.
                Это необходимо для безопасности. Если callback_url не пройдет проверку, вебхук будет пропущен.
              </li>
              <li>
                <strong style={{ color: 'var(--nav-text-primary)' }}>Вебхук — не единственный сигнал:</strong> он отправляется в момент, когда платёж проверяется и
                оказывается успешным — либо когда вы сами вызываете <Code>GET /api/kaspi/pay/status</Code> выше,
                либо (если вы этого не делаете) когда его обнаружит наш внутренний крон, который на бесплатном тарифе
                нашего хостинга запускается не чаще раза в сутки. Если вам важна скорость подтверждения — опрашивайте
                статус-эндпоинт сами, не полагайтесь только на вебхук.
              </li>
            </ul>
          </div>

          <p className="mb-4" style={{ color: 'var(--nav-text-secondary)' }}>Тело вебхука (JSON):</p>
          <InfoBlock>
            <CodeBlock>
{`{
  "event": "payment.success",
  "order_id": "order_12345",
  "amount": 10000,
  "operation_id": "op_123456789"
}`}
            </CodeBlock>
          </InfoBlock>

          <p className="mb-4" style={{ color: 'var(--nav-text-secondary)' }}>Заголовок вебхука:</p>
          <InfoBlock>
            <CodeBlock>
X-Kaspi-Pay-Signature: &lt;hex-encoded HMAC-SHA256&gt;
            </CodeBlock>
          </InfoBlock>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--nav-text-primary)' }}>Верификация подписи вебхука</h2>
          <p className="mb-4" style={{ color: 'var(--nav-text-secondary)' }}>
            Вебхуки подписаны HMAC-SHA256 подписью в заголовке <Code>X-Kaspi-Pay-Signature</Code>.
            Это позволяет вам убедиться, что вебхук действительно от invoices.kz.
          </p>

          <p className="mb-4" style={{ color: 'var(--nav-text-secondary)' }}>
            Для верификации подписи вычислите HMAC-SHA256 от сырого JSON тела вебхука, используя секретный ключ,
            и сравните результат с заголовком. Вот пример на Node.js:
          </p>

          <InfoBlock>
            <CodeBlock>
{`const crypto = require('crypto');

// rawBody — это точная строка JSON, полученная из тела запроса
// secret — ваш webhook-секрет, показанный один раз при подключении
const signature = crypto
  .createHmac('sha256', secret)
  .update(rawBody)
  .digest('hex');

const isValid = signature === req.headers['x-kaspi-pay-signature'];
`}
            </CodeBlock>
          </InfoBlock>

          <div className="nav-glass rounded-xl p-4">
            <p className="font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>Где взять секрет:</p>
            <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
              Ваш webhook-секрет показывается один раз при подключении Кассира, рядом с API-токеном (раздел{' '}
              <Code>/kaspi-api</Code>). Он свой у каждого подключения — вебхуки
              других клиентов invoices.kz подписываются другим ключом, и наоборот. Если секрет потеряли или он
              попал не в те руки — отключите и снова подключите Кассира, будет выдан новый.
            </p>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--nav-text-primary)' }}>Пример запроса (curl)</h2>
          <p className="mb-4" style={{ color: 'var(--nav-text-secondary)' }}>
            Вот полный пример создания платежа через curl:
          </p>

          <InfoBlock>
            <CodeBlock>
{`curl -X POST https://www.invoices.kz/api/kaspi/pay \\
  -H "Authorization: Bearer YOUR_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 10000,
    "order_id": "order_12345",
    "callback_url": "https://example.com/webhook/kaspi"
  }'
`}
            </CodeBlock>
          </InfoBlock>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--nav-text-primary)' }}>Коды ошибок</h2>
          <InfoBlock>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--nav-border-soft)' }}>
                  <th className="text-left p-2" style={{ color: 'var(--nav-text-primary)' }}>Код</th>
                  <th className="text-left p-2" style={{ color: 'var(--nav-text-primary)' }}>Описание</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['401', 'Unauthorized — токен отсутствует или некорректен'],
                  ['400', 'Bad Request — отсутствуют обязательные параметры (только для создания платежа)'],
                  ['402', 'Payment Required — недостаточно средств на балансе кошелька для комиссии (только для создания платежа); пополните баланс на странице подключения'],
                  ['404', 'Not Found — платёж с таким operation_id не найден (только для проверки статуса)'],
                  ['429', 'Too Many Requests — превышен лимит запросов (20 в минуту на одно подключение, только для создания платежа)'],
                  ['502', 'Bad Gateway — ошибка при обращении к Kaspi'],
                ].map(([code, desc], i, arr) => (
                  <tr key={code} style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--nav-border-soft)' : 'none' }}>
                    <td className="p-2"><Code>{code}</Code></td>
                    <td className="p-2" style={{ color: 'var(--nav-text-secondary)' }}>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </InfoBlock>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4" style={{ color: 'var(--nav-text-primary)' }}>Поддержка</h2>
          <p className="mb-3" style={{ color: 'var(--nav-text-secondary)' }}>
            Если у вас возникли вопросы по использованию API, напишите нам:
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
