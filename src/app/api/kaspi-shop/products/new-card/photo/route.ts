import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection, markSessionExpired } from '@/lib/kaspiShop/connection'
import { uploadProductPhoto } from '@/lib/kaspiShop/addProductNewCard'

const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function requireUser(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  return user
}

// Proxies the browser's file upload to Kaspi -- only our server holds the
// merchant's Kaspi session cookie, so the multipart body has to be relayed
// through here rather than posted to mc.shop.kaspi.kz directly.
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Некорректный multipart-запрос' }, { status: 400 })
  }
  const file = form.get('file')
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'Файл не найден' }, { status: 400 })
  }

  const connection = await loadConnection(user.id)
  if (!connection || !connection.sessionCookies) {
    return NextResponse.json({ error: 'Кабинет не подключён' }, { status: 400 })
  }

  const filename = file instanceof File ? file.name : 'photo.jpg'
  const result = await uploadProductPhoto(connection.sessionCookies, file, filename)
  if (!result.success) {
    if (result.sessionExpired) {
      await markSessionExpired(connection.id)
      return NextResponse.json({ error: 'Сессия кабинета Kaspi истекла — переподключите магазин' }, { status: 400 })
    }
    return NextResponse.json({ error: result.message }, { status: 502 })
  }
  return NextResponse.json({ imageId: result.imageId, urls: result.urls })
}
