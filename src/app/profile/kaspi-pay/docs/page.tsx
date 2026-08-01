import type { ReactNode } from 'react'

function QuickStartStep({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="w-8 h-8 rounded-full bg-[#1C2056] text-white text-sm font-semibold flex items-center justify-center flex-shrink-0">
        {n}
      </div>
      <div className="flex-1 pb-6">
        <div className="font-semibold text-[#1C2056] mb-1">{title}</div>
        <div className="text-sm text-gray-600">{children}</div>
      </div>
    </div>
  )
}

export default function KaspiPayDocsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">API документация Kaspi Pay</h1>

      <section className="mb-10 bg-blue-50 border border-blue-100 rounded-2xl p-6">
        <h2 className="text-2xl font-semibold mb-1 text-[#1C2056]">Быстрый старт: приём оплаты на вашем сайте</h2>
        <p className="text-sm text-gray-600 mb-6">
          Эти шаги нужно пройти один раз, чтобы ваш сайт, приложение или бот сами создавали ссылки на оплату Kaspi
          и узнавали, когда клиент оплатил — без вашего участия в каждой оплате.
        </p>

        <div>
          <QuickStartStep n={1} title="Подключите роль «Кассир»">
            На странице <code className="bg-white px-1.5 py-0.5 rounded border">/profile/kaspi-pay</code> введите номер
            телефона, на котором в приложении Kaspi Pay уже выдана роль «Кассир», и подтвердите код из SMS.
          </QuickStartStep>
          <QuickStartStep n={2} title="Сохраните API-токен">
            Сразу после подключения на этой же странице один раз покажется токен вида{' '}
            <code className="bg-white px-1.5 py-0.5 rounded border">62d919bd...</code>. Скопируйте и сохраните его —
            второй раз он не показывается (можно только отключить кассира и подключить заново).
          </QuickStartStep>
          <QuickStartStep n={3} title="Передайте токен разработчику или вставьте в свой сайт">
            Если сайт делаете не вы сами — отправьте этот токен и ссылку на этот документ вашему разработчику.
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
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Получение API токена</h2>
        <p className="text-gray-700 mb-4">
          При подключении Kaspi Pay к вашему аккаунту на invoices.kz вам будет выдан уникальный API токен.
          Этот токен отображается один раз при подключении в разделе{' '}
          <code className="bg-gray-100 px-2 py-1 rounded">/profile/kaspi-pay</code>.
          Сохраните его в безопасном месте — он понадобится для всех запросов к API.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Создание платежа</h2>
        <p className="text-gray-700 mb-4">
          Для создания платежа выполните POST запрос к нашему API:
        </p>

        <div className="bg-gray-50 p-4 rounded mb-4">
          <p className="font-semibold mb-2">Endpoint:</p>
          <code className="text-blue-600">POST https://www.invoices.kz/api/kaspi/pay</code>
        </div>

        <div className="bg-gray-50 p-4 rounded mb-4">
          <p className="font-semibold mb-2">Заголовок аутентификации:</p>
          <code className="text-sm">Authorization: Bearer &lt;ваш_api_токен&gt;</code>
        </div>

        <div className="bg-gray-50 p-4 rounded mb-4">
          <p className="font-semibold mb-2">Тело запроса (JSON):</p>
          <pre className="bg-white p-3 rounded border border-gray-300 overflow-x-auto text-sm">
{`{
  "amount": 10000,
  "order_id": "order_12345",
  "callback_url": "https://example.com/webhook/kaspi"
}`}
          </pre>
          <div className="mt-4 text-sm text-gray-600">
            <p className="font-semibold mb-2">Параметры:</p>
            <ul className="list-disc list-inside space-y-1">
              <li><code className="bg-gray-100 px-1">amount</code> (обязательно) — сумма платежа в тенге (число)</li>
              <li><code className="bg-gray-100 px-1">order_id</code> (обязательно) — уникальный идентификатор заказа (строка)</li>
              <li>
                <code className="bg-gray-100 px-1">callback_url</code> (опционально) — URL вашего вебхука для уведомлений об успешном платеже
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Ответ API</h2>
        <p className="text-gray-700 mb-4">
          При успешном запросе вы получите ответ со статусом 200:
        </p>

        <div className="bg-gray-50 p-4 rounded mb-4">
          <pre className="bg-white p-3 rounded border border-gray-300 overflow-x-auto text-sm">
{`{
  "qr_token": "eyJhbGc...",
  "payment_link": "https://kaspi.kz/pay/...",
  "operation_id": "op_123456789",
  "expire_date": "2024-12-31T23:59:59Z"
}`}
          </pre>
          <div className="mt-4 text-sm text-gray-600">
            <p className="font-semibold mb-2">Поля ответа:</p>
            <ul className="list-disc list-inside space-y-1">
              <li><code className="bg-gray-100 px-1">qr_token</code> — токен для отображения QR кода платежа</li>
              <li><code className="bg-gray-100 px-1">payment_link</code> — ссылка для платежа (может быть передана клиентам)</li>
              <li><code className="bg-gray-100 px-1">operation_id</code> — уникальный идентификатор операции на стороне Kaspi</li>
              <li><code className="bg-gray-100 px-1">expire_date</code> — дата и время истечения QR кода</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Проверка статуса платежа</h2>
        <p className="text-gray-700 mb-4">
          Kaspi не присылает нам уведомление о том, что QR оплачен — мы сами должны спросить у Kaspi.
          Самый быстрый способ узнать, что платёж прошёл — спросить у нас напрямую, пока клиент ещё на странице оплаты:
        </p>

        <div className="bg-gray-50 p-4 rounded mb-4">
          <p className="font-semibold mb-2">Endpoint:</p>
          <code className="text-blue-600">GET https://www.invoices.kz/api/kaspi/pay/status?operation_id=op_123456789</code>
        </div>

        <div className="bg-gray-50 p-4 rounded mb-4">
          <p className="font-semibold mb-2">Заголовок аутентификации:</p>
          <code className="text-sm">Authorization: Bearer &lt;ваш_api_токен&gt;</code>
        </div>

        <div className="bg-gray-50 p-4 rounded mb-4">
          <p className="font-semibold mb-2">Ответ (JSON):</p>
          <pre className="bg-white p-3 rounded border border-gray-300 overflow-x-auto text-sm">
{`{
  "operation_id": "op_123456789",
  "order_id": "order_12345",
  "amount": 10000,
  "status": "paid",
  "paid": true
}`}
          </pre>
          <div className="mt-4 text-sm text-gray-600">
            <p className="font-semibold mb-2">Значения <code className="bg-gray-100 px-1">status</code>:</p>
            <ul className="list-disc list-inside space-y-1">
              <li><code className="bg-gray-100 px-1">pending</code> — ожидает оплаты</li>
              <li><code className="bg-gray-100 px-1">paid</code> — оплачен</li>
              <li><code className="bg-gray-100 px-1">expired</code> — QR истёк без оплаты</li>
            </ul>
          </div>
        </div>

        <p className="text-gray-700 mb-4">
          Каждый вызов этого эндпоинта запускает реальную проверку у Kaspi (не просто читает нашу базу), поэтому
          опрашивать его можно, например, раз в несколько секунд, пока клиент ждёт оплаты на вашей странице —
          так же делает и наша собственная страница счёта.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Вебхуки (webhook)</h2>
        <p className="text-gray-700 mb-4">
          Если вы указали <code className="bg-gray-100 px-1">callback_url</code> при создании платежа,
          мы отправим уведомление об успешном платеже POST запросом на этот URL.
        </p>

        <div className="bg-blue-50 border border-blue-200 p-4 rounded mb-4">
          <p className="font-semibold text-blue-900 mb-2">⚠️ Важно:</p>
          <ul className="text-sm text-blue-900 space-y-2">
            <li>
              <strong>HTTPS обязателен:</strong> callback_url должен начинаться с <code className="bg-white px-1">https://</code>
            </li>
            <li>
              <strong>Не localhost/частные сети:</strong> URL не должен указывать на localhost, 192.168.x.x, 10.x.x.x, 172.16–31.x.x или другие приватные адреса.
              Это необходимо для безопасности. Если callback_url не пройдет проверку, вебхук будет пропущен.
            </li>
            <li>
              <strong>Вебхук — не единственный сигнал:</strong> он отправляется в момент, когда платёж проверяется и
              оказывается успешным — либо когда вы сами вызываете <code className="bg-white px-1">GET /api/kaspi/pay/status</code> выше,
              либо (если вы этого не делаете) когда его обнаружит наш внутренний крон, который на бесплатном тарифе
              нашего хостинга запускается не чаще раза в сутки. Если вам важна скорость подтверждения — опрашивайте
              статус-эндпоинт сами, не полагайтесь только на вебхук.
            </li>
          </ul>
        </div>

        <p className="text-gray-700 mb-4">Тело вебхука (JSON):</p>
        <div className="bg-gray-50 p-4 rounded mb-4">
          <pre className="bg-white p-3 rounded border border-gray-300 overflow-x-auto text-sm">
{`{
  "event": "payment.success",
  "order_id": "order_12345",
  "amount": 10000,
  "operation_id": "op_123456789"
}`}
          </pre>
        </div>

        <p className="text-gray-700 mb-4">Заголовок вебхука:</p>
        <div className="bg-gray-50 p-4 rounded mb-4">
          <pre className="bg-white p-3 rounded border border-gray-300 overflow-x-auto text-sm">
X-Kaspi-Pay-Signature: &lt;hex-encoded HMAC-SHA256&gt;
          </pre>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Верификация подписи вебхука</h2>
        <p className="text-gray-700 mb-4">
          Вебхуки подписаны HMAC-SHA256 подписью в заголовке <code className="bg-gray-100 px-1">X-Kaspi-Pay-Signature</code>.
          Это позволяет вам убедиться, что вебхук действительно от invoices.kz.
        </p>

        <p className="text-gray-700 mb-4">
          Для верификации подписи вычислите HMAC-SHA256 от сырого JSON тела вебхука, используя секретный ключ,
          и сравните результат с заголовком. Вот пример на Node.js:
        </p>

        <div className="bg-gray-50 p-4 rounded mb-4">
          <pre className="bg-white p-3 rounded border border-gray-300 overflow-x-auto text-sm">
{`const crypto = require('crypto');

// rawBody — это точная строка JSON, полученная из тела запроса
// secret — секретный ключ, который будет предоставлен вам
const signature = crypto
  .createHmac('sha256', secret)
  .update(rawBody)
  .digest('hex');

const isValid = signature === req.headers['x-kaspi-pay-signature'];
`}
          </pre>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 p-4 rounded">
          <p className="font-semibold text-yellow-900 mb-2">⚠️ Примечание о верификации:</p>
          <p className="text-sm text-yellow-900 mb-2">
            Вебхуки подписываются отдельным ключом, который используется <strong>только</strong> для подписи вебхуков.
            Он никак не связан с ключом шифрования подключений — тем, которым защищены данные вашей связки с Kaspi,
            — поэтому передача этого ключа клиенту не влияет на безопасность подключений.
          </p>
          <p className="text-sm text-yellow-900">
            При этом сам механизм выдачи ключа внешним клиентам ещё не финализирован: на данный момент заголовок подписи
            отправляется, а способ получения ключа будет уточнён до того, как этим API начнут пользоваться внешние клиенты.
          </p>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Пример запроса (curl)</h2>
        <p className="text-gray-700 mb-4">
          Вот полный пример создания платежа через curl:
        </p>

        <div className="bg-gray-50 p-4 rounded">
          <pre className="bg-white p-3 rounded border border-gray-300 overflow-x-auto text-sm">
{`curl -X POST https://www.invoices.kz/api/kaspi/pay \\
  -H "Authorization: Bearer YOUR_API_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 10000,
    "order_id": "order_12345",
    "callback_url": "https://example.com/webhook/kaspi"
  }'
`}
          </pre>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Коды ошибок</h2>
        <div className="bg-gray-50 p-4 rounded">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2">Код</th>
                <th className="text-left p-2">Описание</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="p-2"><code className="bg-gray-100 px-1">401</code></td>
                <td className="p-2">Unauthorized — токен отсутствует или некорректен</td>
              </tr>
              <tr className="border-b">
                <td className="p-2"><code className="bg-gray-100 px-1">400</code></td>
                <td className="p-2">Bad Request — отсутствуют обязательные параметры</td>
              </tr>
              <tr className="border-b">
                <td className="p-2"><code className="bg-gray-100 px-1">403</code></td>
                <td className="p-2">Forbidden — тариф Pro не активен (Kaspi Pay доступен только на тарифе Pro)</td>
              </tr>
              <tr className="border-b">
                <td className="p-2"><code className="bg-gray-100 px-1">404</code></td>
                <td className="p-2">Not Found — платёж с таким operation_id не найден (только для проверки статуса)</td>
              </tr>
              <tr className="border-b">
                <td className="p-2"><code className="bg-gray-100 px-1">429</code></td>
                <td className="p-2">Too Many Requests — превышен лимит запросов (20 в минуту на одно подключение)</td>
              </tr>
              <tr className="border-b">
                <td className="p-2"><code className="bg-gray-100 px-1">502</code></td>
                <td className="p-2">Service Unavailable — ошибка при создании платежа на стороне Kaspi</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Поддержка</h2>
        <p className="text-gray-700">
          Если у вас возникли вопросы по использованию API, свяжитесь с нами через форму обратной связи в вашем аккаунте.
        </p>
      </section>
    </div>
  )
}
