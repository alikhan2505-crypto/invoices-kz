import { NextRequest } from 'next/server'
import { saveToolLead } from '@/lib/toolLeads'

// Shared endpoint for every free tool's optional contact box. The tool name
// comes in the body and is whitelisted inside saveToolLead.
export async function POST(req: NextRequest) {
  return saveToolLead(req, 'waybills')
}
