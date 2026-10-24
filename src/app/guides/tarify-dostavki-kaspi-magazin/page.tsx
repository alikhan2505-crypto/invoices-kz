import type { Metadata } from 'next'
import Link from 'next/link'
import GuideShell from '../GuideShell'
import { getKaspiGuide } from '@/lib/kaspiGuides'
import {
  KASPI_DELIVERY,
  KASPI_DELIVERY_COLUMNS,
  KASPI_EXAMPLE_AMOUNT,
  KASPI_TARIFF_CHECKED_TEXT,
  KASPI_TIERS,
  deliveryRowById,
  formatNumber,
  formatPercent,
  formatTenge,
  kaspiDeliveryExample,
  type KaspiDeliveryRow,
} from '@/lib/kaspiTariff'
import { toolLinkPath } from '@/lib/tools-i18n'
import { DataTable, ExampleBlock, LinksBlock, SourceBlock, kaspiMetadata } from '../_kaspi/blocks'

const guide = getKaspiGuide('tarify-dostavki-kaspi-magazin')

export const metadata: Metadata = kaspiMetadata(
  guide,
  'ru',
  'стоимость доставки kaspi для продавца, тарифы доставки kaspi магазин, kaspi доставка сколько стоит продавцу, kaspi экспресс доставка тариф, тарифы kaspi доставки 2026',
)

const cols = KASPI_DELIVERY_COLUMNS
const head = ['Условие', cols.city.ru, cols.kazakhstan.ru, cols.express.ru]
const toRows = (rows: KaspiDeliveryRow[]) =>
  rows.map(r => [r.ru, formatNumber(r.city), formatNumber(r.kazakhstan), formatNumber(r.express)])

const BASE = formatPercent(KASPI_TIERS.base.withVat)
const exampleRow = deliveryRowById('w-to5')
const ex = kaspiDeliveryExample('base', 'w-to5', 'city')

export default function Page() {
  return (
    <GuideShell guide={guide} lang="ru">
      <h2>От чего зависит стоимость</h2>
      <p>
        Kaspi пишет, что стоимость Kaspi Доставки для продавца зависит от того, куда нужно отправить товар, общей суммы
        заказа и его веса. Таблица ниже действует с {KASPI_DELIVERY.effectiveText}, цены в тенге и без НДС. Три колонки
        в таблице Kaspi называются «{cols.city.ru}», «{cols.kazakhstan.ru}» и «{cols.express.ru}».
      </p>

      <h2>Сумма заказа до {formatTenge(KASPI_DELIVERY.thresholdTenge)}: цена зависит от суммы заказа</h2>
      <DataTable head={head} rows={toRows(KASPI_DELIVERY.underThreshold)} />

      <h2>Сумма заказа {formatTenge(KASPI_DELIVERY.thresholdTenge)} и более: цена зависит от веса</h2>
      <DataTable head={head} rows={toRows([...KASPI_DELIVERY.fromThreshold, ...KASPI_DELIVERY.tires])} />
      <p className="note">
        Строки про шины идут в той же части таблицы, что и вес от {formatTenge(KASPI_DELIVERY.thresholdTenge)}. Названия
        условий даны так, как они написаны у Kaspi.
      </p>

      <h2>Когда списывается и с НДС ли</h2>
      <ul>
        <li>
          Тарифы в таблице указаны <strong>без НДС</strong>, а стоимость доставки списывается с учётом НДС.
        </li>
        <li>
          Списание происходит с текущего счёта продавца и <strong>только если покупатель получил заказ</strong> и его
          статус изменился на «Выдан». Проверить это можно в мобильном приложении Kaspi Pay: Магазин на Kaspi.kz, Заказы,
          Архив.
        </li>
        <li>
          Доставка списывается отдельно от комиссии. Комиссию за продажу Kaspi считает по категории товара, о ней мы
          рассказываем на странице про комиссии.
        </li>
      </ul>

      <ExampleBlock lang="ru" tiers={['base']} />

      <h2>Тот же пример с доставкой Kaspi</h2>
      <p>
        Добавим к продаже на {formatTenge(KASPI_EXAMPLE_AMOUNT)} доставку: заказ {formatTenge(KASPI_EXAMPLE_AMOUNT)} и более,
        вес «{exampleRow.ru}», колонка «{cols.city.ru}». Ставка комиссии {BASE} взята потому, что в таблице тарифов Магазина
        она стоит у подавляющего большинства строк.
      </p>
      <DataTable
        head={['Показатель', 'Сумма']}
        rows={[
          ['Цена продажи', formatTenge(ex.amount)],
          [`Комиссия Kaspi ${BASE}`, formatTenge(ex.commission)],
          [`Доставка Kaspi, «${exampleRow.ru}», «${cols.city.ru}» (без НДС)`, formatTenge(ex.delivery)],
          ['Остаётся до НДС на доставку, налога и себестоимости', formatTenge(ex.left)],
        ]}
      />
      <p className="note">
        НДС на доставку здесь не пересчитан: Kaspi пишет, что списывает доставку с учётом НДС, но ставку для пересчёта на
        этой странице не называет. Точную сумму смотрите в списаниях своего кабинета.
      </p>
      <p>
        Накладные на такие заказы можно собрать в один PDF в бесплатном инструменте{' '}
        <Link href={toolLinkPath('waybills', 'ru')}>накладные Kaspi одним PDF</Link>.
      </p>

      <LinksBlock
        lang="ru"
        siblings={['komissiya-kaspi-s-nds-i-bez-nds', 'komissiya-kaspi-produkty-pitaniya']}
      />
      <SourceBlock
        lang="ru"
        ids={['q2288', 'pdf', 'q1344', 'q4467']}
        intro={`Тарифы доставки взяты со страницы Kaspi «Сколько стоит Kaspi Доставка?», таблица «Тарифы доставки с 1 января 2026 года (без НДС)». Страницу Kaspi открыли и сверили ${KASPI_TARIFF_CHECKED_TEXT}. Ставка комиссии в примере взята из таблицы тарифов Магазина (PDF). Kaspi может менять тарифы, поэтому перед решением по цене проверьте свой кабинет.`}
      />
    </GuideShell>
  )
}
