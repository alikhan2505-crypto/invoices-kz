import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveContractFilePath, signedDocumentUrl } from '@/lib/signedDocumentsServer'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Файл договора для контрагента на /contract-view/[token]. Право смотреть —
// знание public_token договора (как и у всей публичной страницы). Вместо
// вечной публичной ссылки — переадресация на подписанную ссылку, которая
// живёт несколько минут; сама эта страница-ссылка не устаревает, пока жив
// токен, так что кнопка «Открыть файл» работает и через час.
// Человек нажал «Открыть договор» в браузере: вместо сырого JSON показываем
// понятную страницу на его языке (язык передаёт страница договора в ?lang=).
// Программные запросы (без text/html в Accept) по-прежнему получают JSON.
const UNAVAILABLE_TEXT: Record<string, { title: string; text: string }> = {
  ru: { title: 'Файл сейчас недоступен', text: 'Не удалось открыть файл договора. Попробуйте позже или попросите отправителя прислать файл другим способом.' },
  kk: { title: 'Файл қазір қолжетімсіз', text: 'Шарт файлын ашу мүмкін болмады. Кейінірек қайталап көріңіз немесе жіберушіден файлды басқа жолмен жіберуін сұраңыз.' },
  en: { title: 'The file is unavailable right now', text: 'We could not open the contract file. Please try again later or ask the sender to share the file another way.' },
}

function unavailableResponse(req: NextRequest): NextResponse {
  if (!(req.headers.get('accept') || '').includes('text/html')) {
    return NextResponse.json({ error: 'file_unavailable' }, { status: 404 })
  }
  const raw = req.nextUrl.searchParams.get('lang')
  const asked = raw === 'ru' || raw === 'en' ? raw : 'kk'
  const m = UNAVAILABLE_TEXT[asked]
  const html = `<!doctype html><html lang="${asked}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>${m.title} — INVOICES.KZ</title></head><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f9fafb;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1C2056"><main style="max-width:420px;margin:16px;padding:24px;background:#fff;border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,.08);text-align:center"><h1 style="font-size:18px;margin:0 0 8px">${m.title}</h1><p style="font-size:14px;line-height:1.5;margin:0;color:#4b5563">${m.text}</p></main></body></html>`
  return new NextResponse(html, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: contract, error } = await supabase
    .from('contracts')
    .select('user_id, file_url')
    .eq('public_token', token)
    .maybeSingle()
  if (error) {
    console.error('public contract file lookup failed:', error.message)
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500 })
  }
  if (!contract) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Только файл из папки владельца договора — см. contractFilePath.
  const filePath = resolveContractFilePath(contract.file_url, contract.user_id)
  const url = filePath ? await signedDocumentUrl(supabase, filePath) : null
  if (!url) return unavailableResponse(req)
  return NextResponse.redirect(url, { status: 302, headers: { 'Cache-Control': 'no-store' } })
}
