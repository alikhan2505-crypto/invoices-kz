import type { ToolLang } from './index'
import type { DocTool } from './docHandoff'

// Тексты карточки «Нужен ещё документ для этого клиента?» (15.11.2026), которая
// стоит после созданного документа и ведёт к следующему с теми же клиентом и
// позициями (docHandoff.ts). Казахский текст вычитан и принят основателем
// 15.11.2026 (файл «Тексты на вычитку (казахский).md»), правки только после
// вычитки (src/lib/kkReview.ts). В тексте нет тире и эмодзи (правило новых строк интерфейса).

export interface NextDocCopy {
  title: string
  body: string
  /** Подпись кнопки для каждого следующего документа. */
  buttons: Record<DocTool, string>
}

const RU: NextDocCopy = {
  title: 'Нужен ещё документ для этого клиента?',
  body: 'Клиент, позиции, НДС и ваши реквизиты подставятся сами, останется проверить и создать.',
  buttons: {
    avr: 'Составить акт выполненных работ',
    kp: 'Составить коммерческое предложение',
    schet: 'Составить счёт на оплату',
    nakladnaya: 'Составить накладную',
  },
}

const EN: NextDocCopy = {
  title: 'Need another document for this client?',
  body: 'The client, items, VAT and your details fill in by themselves, you only check and create.',
  buttons: {
    avr: 'Make a certificate of completed works',
    kp: 'Make a commercial proposal',
    schet: 'Make an invoice',
    nakladnaya: 'Make a delivery note',
  },
}

const KK: NextDocCopy = {
  title: 'Осы клиентке тағы бір құжат керек пе?',
  body: 'Клиент, позициялар, ҚҚС және сіздің деректемелеріңіз өзі толады, тексеріп, жасау ғана қалады.',
  buttons: {
    avr: 'Орындалған жұмыстар актісін жасау',
    kp: 'Коммерциялық ұсыныс жасау',
    schet: 'Төлем шотын жасау',
    nakladnaya: 'Жүкқұжат жасау',
  },
}

export function nextDocCopy(lang: ToolLang): NextDocCopy {
  if (lang === 'ru') return RU
  if (lang === 'en') return EN
  return KK
}
