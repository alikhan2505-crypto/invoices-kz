// Что показывать в «Переписке»: всё входящее и только реально отправленное
// исходящее. Черновики со статусом skipped (отклонён в очереди проверки) и
// pending_review (ещё ждёт решения) клиент не получал, а лента рисовала их
// пузырём «ИИ», будто ответ ушёл. Один фильтр PostgREST на ленту и превью
// в списке диалогов, чтобы они не расходились.
export const VISIBLE_IN_DIALOG_FILTER = 'direction.eq.inbound,status.eq.sent'

export function isVisibleInDialog(m: { direction: string; status: string | null }): boolean {
  return m.direction === 'inbound' || m.status === 'sent'
}
