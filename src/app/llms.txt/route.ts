import { buildLlmsTxt } from '@/lib/llmsTxt'

// /llms.txt: раньше статический public/llms.txt. Теперь собирается из кода, чтобы
// разделы про комиссии Kaspi и БИК появлялись только при SEO_TARIFF_BIK_LIVE = true.
// force-static: ответ строится на сборке, динамических API здесь нет.
export const dynamic = 'force-static'

export function GET() {
  return new Response(buildLlmsTxt(), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
