import { redirect } from 'next/navigation'

// Kaspi API documentation moved to its own standalone section (2026-08-19,
// founder: "Kaspi API выведен отдельно так же как Каспи кабинет и ИИ
// агент") — see /kaspi-api/docs. Server-side redirect so old bookmarks/links
// never 404.
export default function KaspiPayDocsRedirect() {
  redirect('/kaspi-api/docs')
}
