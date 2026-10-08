'use client'
import { GuidedTour, type TourStep } from '@/components/DashboardTour'
import { markTourDone } from '@/lib/cfo/data'
import { useCfo } from './CfoWorkspace'

const STEPS: Record<'business' | 'family', TourStep[]> = {
  business: [
    { anchor: 'cfo-kpis', title: 'Главное за месяц', body: 'Выручка, прибыль, деньги на счетах и на сколько дней их хватит. Месяц можно сменить справа вверху.' },
    { anchor: 'cfo-operations', title: 'Операции — календарём', body: 'Каждый приход и расход. Нажмите на день, чтобы добавить операцию, или загрузите выписку из банка.' },
    { anchor: 'cfo-calendar', title: 'Платёжный календарь', body: 'Будущие платежи по дням и прогноз остатка. Если денег не хватит — предупредим заранее о кассовом разрыве.' },
    { anchor: 'cfo-pnl', title: 'Отчёты', body: 'БДР — прибыль по начислению, БДДС — движение денег. Факт, план и отклонение, выгрузка в Excel.' },
    { anchor: 'cfo-plan', title: 'План и лимиты', body: 'Задайте план по статьям — отчёты покажут отклонение, а обзор предупредит о перерасходе.' },
    { anchor: 'cfo-ask', title: 'Спросите CFO', body: 'Вопрос обычным языком — «почему упала прибыль?» — и ИИ ответит по вашим цифрам.' },
    { anchor: 'cfo-settings', title: 'Telegram', body: 'В настройках подключите утреннюю сводку и записывайте операции сообщением боту или фото чека.' },
  ],
  family: [
    { anchor: 'cfo-kpis', title: 'Главное за месяц', body: 'Доходы, расходы, сколько удалось сберечь и на сколько хватит денег.' },
    { anchor: 'cfo-operations', title: 'Траты — календарём', body: 'Каждая трата и поступление. Нажмите на день, чтобы добавить, или загрузите выписку Kaspi.' },
    { anchor: 'cfo-calendar', title: 'Платежи', body: 'Что и когда платить: кредит, аренда, коммуналка, садик. Предупредим, если до зарплаты денег не хватит.' },
    { anchor: 'cfo-plan', title: 'Бюджет', body: 'Сколько семья готова тратить на продукты, кафе, транспорт — обзор покажет, где перерасход.' },
    { anchor: 'cfo-ask', title: 'Спросите помощника', body: 'Например: «Сколько мы можем откладывать в месяц?» — ИИ ответит по вашим цифрам.' },
    { anchor: 'cfo-settings', title: 'Telegram', body: 'Подключите утреннюю сводку и записывайте траты сообщением боту или фото чека — прямо из магазина.' },
  ],
}

// Тур с подсветкой при первом входе в кабинет; «пройден» запоминается у компании.
export default function CfoTour() {
  const { ws } = useCfo()
  if (ws.tourDone || ws.hasDemo) return null
  return <GuidedTour steps={STEPS[ws.mode ?? 'business']} shouldStart={async () => true} onFinish={() => markTourDone(ws)} />
}
