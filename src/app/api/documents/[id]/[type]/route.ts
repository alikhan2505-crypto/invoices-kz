import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Streams a signed document back through invoices.kz instead of handing out
// the raw Supabase Storage URL directly — a link opened on a phone otherwise
// shows the bare *.supabase.co project host in the browser chrome, which
// reads as untrustworthy/unbranded for a document meant to carry legal
// weight. No auth: same public trust model as the invoice itself (this
// route is only ever linked from the public-token-gated invoice pages).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; type: string }> }
) {
  const { id, type } = await params
  if (type !== 'document' && type !== 'card') {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }

  const { data: row } = await supabase
    .from('document_signatures')
    .select('document_type, document_id, snapshot_pdf_url, display_pdf_url, ddc_pdf_url')
    .eq('id', id)
    .single()

  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const sourceUrl = type === 'card' ? row.ddc_pdf_url : (row.display_pdf_url || row.snapshot_pdf_url)
  if (!sourceUrl) return NextResponse.json({ error: 'Not available' }, { status: 404 })

  let label = id
  if (row.document_type === 'invoice') {
    const { data: invoice } = await supabase.from('invoices').select('number').eq('id', row.document_id).single()
    label = invoice?.number || id
  } else if (row.document_type === 'contract') {
    const { data: contract } = await supabase.from('contracts').select('title').eq('id', row.document_id).single()
    label = (contract?.title || id).replace(/[^a-zA-Z0-9-]/g, '_')
  }
  const filename = type === 'card' ? `Card-${label}.pdf` : `Schet-${label}.pdf`
  const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  const safeFilename = escapeHtml(filename)

  const fileRes = await fetch(sourceUrl)
  if (!fileRes.ok) return NextResponse.json({ error: 'Source fetch failed' }, { status: 502 })
  const bytes = await fileRes.arrayBuffer()

  // A raw application/pdf response opens straight in the browser's native
  // PDF viewer, which always shows its own generic file icon in the tab --
  // there's no HTML <head> for a favicon to live in. Wrapping it in a
  // minimal branded shell (invoices.kz icon/title, PDF embedded via a data
  // URI) gives the tab the same identity as every other invoices.kz page.
  const base64 = Buffer.from(bytes).toString('base64')
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${safeFilename}</title>
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<style>html,body{margin:0;height:100%;background:#525659}iframe{border:0;width:100%;height:100%}</style>
</head>
<body>
<iframe src="data:application/pdf;base64,${base64}" title="${safeFilename}"></iframe>
</body>
</html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
