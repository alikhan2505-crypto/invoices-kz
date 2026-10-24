import type { Metadata } from 'next'
import GuideShell from '../GuideShell'
import { getKaspiGuide } from '@/lib/kaspiGuides'
import {
  KASPI_GADGET_ROWS_BASE,
  KASPI_PHONE_ACCESSORIES,
  KASPI_TIERS,
  KASPI_TV_AUDIO,
  formatPercent,
} from '@/lib/kaspiTariff'
import { DataTable, ExampleBlock, LinksBlock, SourceBlock, kaspiMetadata, quoteList } from '../_kaspi/blocks'

const guide = getKaspiGuide('komissiya-kaspi-aksessuary-dlya-telefonov')

export const metadata: Metadata = kaspiMetadata(
  guide,
  'ru',
  'комиссия kaspi чехлы для телефонов, комиссия каспи защитное стекло, комиссия kaspi зарядное устройство, комиссия каспи повербанк, комиссия каспи чехлы для наушников',
)

const HIGH = formatPercent(KASPI_TIERS.high.withVat)
const HIGH_NV = formatPercent(KASPI_TIERS.high.withoutVat)
const BASE = formatPercent(KASPI_TIERS.base.withVat)
const N = KASPI_PHONE_ACCESSORIES.length
const highCount = KASPI_PHONE_ACCESSORIES.filter(r => r.tier === 'high').length
const baseRows = KASPI_PHONE_ACCESSORIES.filter(r => r.tier === 'base').map(r => r.name)

export default function Page() {
  return (
    <GuideShell guide={guide} lang="ru">
      <h2>Ставка</h2>
      <p>
        В категории «Телефоны и гаджеты» есть подкатегория «Аксессуары для телефонов», в ней {N} строк тарифа.{' '}
        {highCount} из них идут по <strong>{HIGH} с НДС</strong> ({HIGH_NV} без НДС), а остальные {baseRows.length} ({quoteList(baseRows)}) по {BASE}. Сами телефоны и гаджеты стоят {BASE}.
      </p>

      <h2>Все {N} строк подкатегории</h2>
      <DataTable
        head={['Строка тарифа', 'Комиссия с НДС']}
        rows={KASPI_PHONE_ACCESSORIES.map(r => [r.name, formatPercent(KASPI_TIERS[r.tier].withVat)])}
      />

      <h2>Неочевидные случаи</h2>
      <ul>
        <li>
          <strong>Зарядка и кабель стоят по-разному.</strong> «Зарядные устройства» и «Внешние аккумуляторы» идут по {BASE},
          а «Кабели и переходники для смартфонов» и «Чехлы для зарядных устройств и кабелей» по {HIGH}.
        </li>
        <li>
          <strong>Чехол для смартфона и чехол для часов.</strong> «Чехлы для смартфонов» стоят {HIGH}, а «Чехлы для
          смарт-часов и фитнес-браслетов» и «Чехлы для электронных книг» в подкатегории «Гаджеты» по {BASE}.
        </li>
        <li>
          <strong>Чехлы для наушников.</strong> Строка «Чехлы для наушников» лежит не здесь, а в категории «ТВ, Аудио,
          Видео», подкатегория «Аудиотехника», и стоит {HIGH}. Это единственная строка с такой ставкой в этой категории,
          остальные {KASPI_TV_AUDIO.baseRows} строк стоят {BASE}.
        </li>
      </ul>

      <h2>Остальная категория «Телефоны и гаджеты»</h2>
      <p>
        Остальные {KASPI_GADGET_ROWS_BASE.length} строк категории, кроме «Аксессуаров для телефонов», стоят {BASE}:{' '}
        {quoteList(KASPI_GADGET_ROWS_BASE)}.
      </p>

      <ExampleBlock lang="ru" tiers={['base', 'high']} />
      <LinksBlock
        lang="ru"
        siblings={['komissiya-kaspi-aksessuary', 'komissiya-kaspi-ukrasheniya', 'komissiya-kaspi-s-nds-i-bez-nds']}
      />
      <SourceBlock lang="ru" ids={['pdf', 'q1344', 'q4467']} />
    </GuideShell>
  )
}
