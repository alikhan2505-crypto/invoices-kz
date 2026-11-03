'use client'
import { GuidedTour, type TourStep } from '@/components/DashboardTour'
import { isTourSeen, markTourSeen } from '@/lib/tourSeen'

// Тур первого входа в AI-агент — показывается только когда есть хотя бы один
// агент (пустое состояние объясняет себя само кнопкой «Создать агента»).
// «Показан» — в localStorage и cookie на .invoices.kz, как у тура Kaspi Shop
// (src/lib/tourSeen.ts): без миграции, ценой повтора на другом устройстве.
// Повторно запустить тур можно из панели помощи («?» вверху справа).
const ID = 'agent'
const LEGACY_KEY = 'ai-agent-tour-done'

// «menu» (мобильный гамбургер) и «menu-desktop» (строка разделов) никогда не
// отрисованы одновременно — GuidedTour сам пропустит отсутствующий якорь.
// «wallet» — глобальный якорь TopUtilityBar.
const STEPS: TourStep[] = [
  {
    anchor: 'ai-agents-head',
    title: 'Ваши агенты',
    body: 'Один агент — один бот со своим характером, целью и каналами. Нажмите на карточку, чтобы изменить промпт и подключения, или создайте второго агента под другую задачу.',
  },
  {
    anchor: 'ai-agents-list',
    title: 'Карточка агента',
    body: 'Статус, цель и подключённые каналы: Instagram, WhatsApp, Telegram и чат-виджет для сайта. Агент отвечает клиентам сам — по вашему прайсу и правилам.',
  },
  {
    anchor: 'menu',
    title: 'Диалоги, Заявки и остальное',
    body: 'Вся переписка из всех каналов — в «Диалогах», собранные контакты — в «Заявках» канбаном. Там же Рассылки, Сценарии, Тест-чат и Аналитика.',
  },
  {
    anchor: 'menu-desktop',
    title: 'Диалоги, Заявки и остальное',
    body: 'Вся переписка из всех каналов — в «Диалогах», собранные контакты — в «Заявках» канбаном. Рядом Рассылки, Сценарии, Тест-чат и Аналитика.',
  },
  {
    anchor: 'wallet',
    title: 'Единый кошелёк',
    body: 'Ответы ИИ списываются с общего кошелька платформы. Пополнение в один клик, баланс всегда виден справа сверху.',
  },
]

export default function AiAgentTour() {
  return (
    <GuidedTour
      steps={STEPS}
      // Хранилища недоступны — тур не показываем (isTourSeen тогда отвечает «показан»).
      shouldStart={async () => {
        const seen = isTourSeen(ID, [LEGACY_KEY])
        // Уже видели: переносим прежний ключ localStorage в общую cookie и продлеваем её
        // (Safari стирает cookie из скриптов через 7 дней), чтобы другой адрес тур не показал.
        if (seen) markTourSeen(ID)
        return !seen
      }}
      onFinish={async () => markTourSeen(ID)}
    />
  )
}
