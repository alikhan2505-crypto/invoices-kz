// Право instagram_business_manage_comments для подключений Instagram.
//
// Private Reply (личное сообщение автору комментария) при Instagram Login
// требует instagram_business_basic + instagram_business_manage_comments
// (документация Meta, Private Replies). Маршрут подключения выдаёт это право
// только владельцам-админам (connect/route.ts: у обычных клиентов запрашиваются
// лишь basic + manage_messages, App Review по comments от 07.09 не пройден).
//
// Когда основатель решит выдавать право всем (после подтверждённого одобрения
// Meta), достаточно поставить true: и маршрут подключения, и режим @comment_ack
// обработчика подхватят это из одного места.
export const CUSTOMER_COMMENTS_SCOPE_APPROVED = false

export function ownerHasCommentsScope(ownerIsAdmin: boolean): boolean {
  return CUSTOMER_COMMENTS_SCOPE_APPROVED || ownerIsAdmin
}
