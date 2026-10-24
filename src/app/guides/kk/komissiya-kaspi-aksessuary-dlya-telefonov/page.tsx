// kk: вычитка носителем ждёт основателя
import type { Metadata } from 'next'
import GuideShell from '../../GuideShell'
import { getKaspiGuide } from '@/lib/kaspiGuides'
import {
  KASPI_GADGET_ROWS_BASE,
  KASPI_PHONE_ACCESSORIES,
  KASPI_TIERS,
  KASPI_TV_AUDIO,
  formatPercent,
} from '@/lib/kaspiTariff'
import { DataTable, ExampleBlock, LinksBlock, SourceBlock, kaspiMetadata, quoteList } from '../../_kaspi/blocks'

const guide = getKaspiGuide('komissiya-kaspi-aksessuary-dlya-telefonov')

export const metadata: Metadata = kaspiMetadata(
  guide,
  'kk',
  'kaspi телефон қаптары комиссиясы, kaspi қорғаныс әйнегі комиссия, kaspi зарядтағыш комиссия, kaspi повербанк комиссия, kaspi құлаққап қабы комиссия',
)

const HIGH = formatPercent(KASPI_TIERS.high.withVat)
const HIGH_NV = formatPercent(KASPI_TIERS.high.withoutVat)
const BASE = formatPercent(KASPI_TIERS.base.withVat)
const N = KASPI_PHONE_ACCESSORIES.length
const highCount = KASPI_PHONE_ACCESSORIES.filter(r => r.tier === 'high').length
const baseRows = KASPI_PHONE_ACCESSORIES.filter(r => r.tier === 'base').map(r => r.name)

export default function Page() {
  return (
    <GuideShell guide={guide} lang="kk">
      <h2>Мөлшерлеме</h2>
      <p>
        «Телефоны и гаджеты» санатында «Аксессуары для телефонов» ішкі санаты бар, онда тарифтің {N} жолы бар. Олардың{' '}
        {highCount}-і <strong>ҚҚС-пен {HIGH}</strong> (ҚҚС-сыз {HIGH_NV}) бойынша, ал қалған {baseRows.length} жол ({quoteList(baseRows)}) {BASE} бойынша. Телефондар мен гаджеттердің өзі {BASE} тұр.
      </p>

      <h2>Ішкі санаттың барлық {N} жолы</h2>
      <DataTable
        head={['Тариф жолы', 'ҚҚС-пен комиссия']}
        rows={KASPI_PHONE_ACCESSORIES.map(r => [r.name, formatPercent(KASPI_TIERS[r.tier].withVat)])}
      />

      <h2>Айқын емес жағдайлар</h2>
      <ul>
        <li>
          <strong>Зарядтағыш пен кабель әртүрлі тұр.</strong> «Зарядные устройства» және «Внешние аккумуляторы» {BASE}{' '}
          бойынша, ал «Кабели и переходники для смартфонов» және «Чехлы для зарядных устройств и кабелей» {HIGH} бойынша.
        </li>
        <li>
          <strong>Смартфон қабы мен сағат қабы.</strong> «Чехлы для смартфонов» {HIGH} тұр, ал «Гаджеты» ішкі
          санатындағы «Чехлы для смарт-часов и фитнес-браслетов» және «Чехлы для электронных книг» {BASE} тұр.
        </li>
        <li>
          <strong>Құлаққап қаптары.</strong> «Чехлы для наушников» жолы мұнда емес, «ТВ, Аудио, Видео» санатындағы
          «Аудиотехника» ішкі санатында және {HIGH} тұр. Бұл санатта осындай мөлшерлемесі бар жалғыз жол, қалған{' '}
          {KASPI_TV_AUDIO.baseRows} жол {BASE} тұр.
        </li>
      </ul>

      <h2>«Телефоны и гаджеты» санатының қалған бөлігі</h2>
      <p>
        «Аксессуары для телефонов» ішкі санатынан басқа санаттың қалған {KASPI_GADGET_ROWS_BASE.length} жолы {BASE} тұр:{' '}
        {quoteList(KASPI_GADGET_ROWS_BASE)}.
      </p>

      <ExampleBlock lang="kk" tiers={['base', 'high']} />
      <LinksBlock
        lang="kk"
        siblings={['komissiya-kaspi-aksessuary', 'komissiya-kaspi-ukrasheniya', 'komissiya-kaspi-s-nds-i-bez-nds']}
      />
      <SourceBlock lang="kk" ids={['pdf', 'q1344', 'q4467']} />
    </GuideShell>
  )
}
