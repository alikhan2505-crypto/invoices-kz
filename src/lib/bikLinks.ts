// Внутренние ссылки на справочник БИК (/bik) из гайдов, инструмента «Счёт» и
// кабинета. Лёгкий модуль без таблицы банков: его импортируют клиентские
// компоненты, и тянуть в их бандл реестр на 33 строки незачем. Пока
// SEO_TARIFF_BIK_LIVE = false всё возвращает null, и ссылки нигде не рисуются
// (страницы /bik закрыты от индексации, на них рано вести людей).

import { SEO_TARIFF_BIK_LIVE } from './seoLaunch'

export type BikLinkLang = 'ru' | 'kk' | 'en'

export interface BikLink {
  href: string
  label: string
}

const LABEL: Record<BikLinkLang, string> = {
  ru: 'Справочник БИК банков Казахстана',
  kk: 'Қазақстан банктерінің БСК анықтамалығы',
  en: 'BIK directory of Kazakhstan banks (in Russian)',
}

/**
 * Ссылка на хаб /bik. Страницы есть только на ru и kk: английский интерфейс ведёт
 * на русскую версию. `live` по умолчанию берётся из флага запуска, параметр для тестов.
 */
export function bikHubLink(lang: string, live: boolean = SEO_TARIFF_BIK_LIVE): BikLink | null {
  if (!live) return null
  if (lang === 'kk') return { href: '/bik/kk', label: LABEL.kk }
  return { href: '/bik', label: lang === 'en' ? LABEL.en : LABEL.ru }
}

/** Карточка в индексе гайдов (/guides, /guides/kk). */
export function bikGuidesIndexCard(lang: 'ru' | 'kk', live: boolean = SEO_TARIFF_BIK_LIVE): { href: string; title: string; text: string } | null {
  if (!live) return null
  return lang === 'kk'
    ? {
        href: '/bik/kk',
        title: 'Қазақстан банктерінің БСК',
        text: 'Ұлттық Банк анықтамалығы: 33 ұйымның БСК-ы мен банк коды',
      }
    : {
        href: '/bik',
        title: 'БИК банков Казахстана',
        text: 'Справочник Нацбанка: БИК и код банка 33 участников',
      }
}
