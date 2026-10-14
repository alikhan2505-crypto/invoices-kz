import type { ToolLang } from './index'

// Поиск названия компании по БИН/ИИН в бесплатных документах /tools (kp, schet,
// avr, nakladnaya): общие тексты и разбор ответа POST /api/tools/name-lookup.
// Тексты одни на все четыре инструмента — подписи самих полей БИН остаются в
// dict.ts инструмента (у каждого своя сторона: клиент, заказчик, получатель).

export type NameLookupStatus = 'idle' | 'loading' | 'found' | 'miss' | 'limit' | 'unavailable'

export type NameLookupCopy = {
  button: string
  loading: string
  found: string
  miss: string
  limit: string
  unavailable: string
}

export const NAME_LOOKUP_TEXT: Record<ToolLang, NameLookupCopy> = {
  ru: {
    button: 'Найти',
    loading: 'Ищем название по БИН/ИИН…',
    found: 'Название подставлено из реестра',
    miss: 'По этому БИН/ИИН ничего не нашли — введите название вручную',
    limit: 'Поиск для этого поля на этот квартал исчерпан — введите название вручную',
    unavailable: 'Поиск сейчас недоступен — введите название вручную',
  },
  kk: {
    button: 'Табу',
    loading: 'Атауын БСН/ЖСН бойынша іздеп жатырмыз…',
    found: 'Атауы тізілімнен қойылды',
    miss: 'Бұл БСН/ЖСН бойынша ештеңе табылмады — атауын қолмен енгізіңіз',
    limit: 'Бұл өріс үшін осы тоқсандағы іздеу таусылды — атауын қолмен енгізіңіз',
    unavailable: 'Іздеу қазір қолжетімсіз — атауын қолмен енгізіңіз',
  },
  en: {
    button: 'Find',
    loading: 'Looking up the name by BIN/IIN…',
    found: 'Name filled in from the registry',
    miss: 'Nothing found for this BIN/IIN — type the name manually',
    limit: 'Lookups for this field are used up for this quarter — type the name manually',
    unavailable: 'Lookup is unavailable right now — type the name manually',
  },
}

/**
 * Ответ роута → статус под полем и название (только при found). Всё, что не
 * «нашли», «не нашли» или «лимит» (busy, 4xx/5xx, битый JSON), — «недоступно»:
 * человек в любом случае вводит название руками.
 */
export function parseNameLookupResponse(ok: boolean, data: unknown): { status: NameLookupStatus; name: string | null } {
  const d = (data && typeof data === 'object' ? data : {}) as { found?: unknown; name?: unknown; reason?: unknown }
  if (ok && d.found === true && typeof d.name === 'string' && d.name.trim()) {
    return { status: 'found', name: d.name.trim() }
  }
  if (ok && d.reason === 'not_found') return { status: 'miss', name: null }
  if (ok && d.reason === 'limit') return { status: 'limit', name: null }
  return { status: 'unavailable', name: null }
}

/** Подпись кнопки для экранного диктора: «Найти: БИН / ИИН заказчика» (без звёздочки обязательности). */
export function lookupAriaLabel(button: string, fieldLabel: string): string {
  return `${button}: ${fieldLabel.replace(/\s*\*\s*$/, '').trim()}`
}
