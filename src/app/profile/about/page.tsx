import { redirect } from 'next/navigation'

// «О приложении» слито со страницей поддержки в один раздел «Помощь и о
// сервисе» (ревизия /profile 15.10.2026). Старый адрес оставлен рабочим —
// на него ведут закладки и ссылки, — и просто перенаправляет к блоку «О сервисе».
export default function About() {
  redirect('/profile/support#about')
}
