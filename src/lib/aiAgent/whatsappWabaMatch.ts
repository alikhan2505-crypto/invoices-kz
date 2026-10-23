// Вебхук WhatsApp маршрутизирует по metadata.phone_number_id, а entry.id в
// каждой доставке -- это WABA, которому номер принадлежит на стороне Meta.
// Если у соединения waba_id сохранён и не совпадает с entry.id, доставка пришла
// не про это соединение (например, строку перехватили чужим phoneNumberId):
// такое сообщение пропускаем, а не отдаём чужому агенту.
//
// Без отката назад: старые соединения могли сохраниться без waba_id (пустая
// строка из loadWhatsAppConnection) или доставка без entry.id -- тогда не режем.
export function entryMatchesWabaId(entryId: unknown, storedWabaId: string | null | undefined): boolean {
  if (!storedWabaId) return true
  if (entryId === undefined || entryId === null || entryId === '') return true
  return String(entryId) === storedWabaId
}
