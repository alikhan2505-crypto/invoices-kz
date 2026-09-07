import { NextRequest } from 'next/server'
import { saveToolLead } from '@/lib/toolLeads'

// The waybill tool's original endpoint, kept so a tab opened before the
// shared /api/tools/lead shipped still records its lead instead of silently
// losing it (the page swallows the error and thanks the visitor either way).
// New tools should post to /api/tools/lead with a `tool` field.
export async function POST(req: NextRequest) {
  return saveToolLead(req, 'waybills')
}
