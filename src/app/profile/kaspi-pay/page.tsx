import { redirect } from 'next/navigation'

// Kaspi Pay Cashier connection/API-token/webhook UI moved to its own
// standalone section (2026-08-19, founder: "Kaspi API выведен отдельно так
// же как Каспи кабинет и ИИ агент") — see /kaspi-api. This used to be a
// client-side redirect to /profile/acquiring (which itself used to host the
// Kaspi Cashier card before an earlier move); now a server-side redirect
// straight to the new home so old bookmarks/links never 404.
export default function KaspiPayRedirect() {
  redirect('/kaspi-api')
}
