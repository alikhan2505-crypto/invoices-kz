// Определение языка сайта. Серверо-безопасный файл (без 'use client'): его
// используют LanguageProvider, корневой layout (встроенный скрипт) и тесты.
//
// Решение основателя 17.10.2026: по умолчанию русский либо язык системы
// посетителя, но НЕ казахский. Порядок:
//   1. явный выбор: кука lang (общая на .invoices.kz) -> localStorage 'lang';
//   2. иначе язык браузера: navigator.languages по порядку, первый из
//      kk / ru / en решает (kk-KZ -> kk, en-US -> en, ru-RU -> ru); незнакомые
//      языки пропускаются, а если знакомых нет вообще — русский;
//   3. роботы (Googlebot шлёт en-US) не угадываются — всегда русский, иначе
//      поисковик увидел бы в отрисованной странице английский вместо русского.
// Догадка по языку браузера НЕ сохраняется: сохраняется только явное
// переключение. Так смена языка браузера продолжает работать, а явный выбор
// никогда не перебивается догадкой.

export type Lang = 'ru' | 'kk' | 'en'

export const DEFAULT_LANG: Lang = 'ru'

export function asLang(v: string | null | undefined): Lang | null {
  return v === 'ru' || v === 'kk' || v === 'en' ? v : null
}

/** Язык из тегов браузера ('kk-KZ', 'en_US', 'RU'): первый знакомый из kk/ru/en. */
export function langFromNavigator(languages: readonly (string | null | undefined)[] | undefined): Lang {
  for (const tag of languages ?? []) {
    if (!tag) continue
    const primary = String(tag).toLowerCase().split(/[-_]/)[0]
    if (primary === 'kk' || primary === 'ru' || primary === 'en') return primary
  }
  return DEFAULT_LANG
}

export const BOT_UA = /bot|crawl|spider|slurp|yandex|bingpreview|facebookexternalhit|lighthouse|pagespeed/i

export interface ResolveInput {
  /** значение куки lang */
  cookie?: string | null
  /** значение localStorage 'lang' */
  stored?: string | null
  /** navigator.languages (или [navigator.language]) */
  languages?: readonly (string | null | undefined)[]
  /** робот: язык браузера не угадываем */
  isBot?: boolean
}

export function resolveLang(input: ResolveInput): Lang {
  const explicit = asLang(input.cookie) ?? asLang(input.stored)
  if (explicit) return explicit
  if (input.isBot) return DEFAULT_LANG
  return langFromNavigator(input.languages)
}

/**
 * Страницы, у которых язык задан АДРЕСОМ (/tools/kk/…, /tools/en/…, /guides/kk/…):
 * текст на сервере уже на этом языке, угадывание по посетителю им не нужно.
 */
export function routeLang(pathname: string | null | undefined): Lang | null {
  const m = /^\/(?:tools|guides)\/(kk|en)(?:\/|$)/.exec(pathname ?? '')
  return m ? (m[1] as Lang) : null
}

// Встроенный скрипт для <head> корневого layout: выполняется до первой
// отрисовки и делает то же, что resolveLang + routeLang, на «голом» DOM.
//  - ставит <html lang> (серверный HTML всегда lang="ru");
//  - если вычисленный язык не русский, а страница не языковая по адресу, —
//    вешает на <html> атрибут data-lang-hold: CSS прячет body (visibility),
//    пока LanguageProvider не отрисует текст на нужном языке и не снимет его.
//    Русскоязычный посетитель (большинство) не получает ни скрытия, ни
//    перерисовки. Страховка, если JS не загрузился: анимация в CSS через
//    LANG_HOLD_CSS сама открывает страницу через 3 секунды.
//    Если скрипт вдруг выполнился уже ПОСЛЕ гидрации (провайдер ставит на <html>
//    data-lang-ready), прятать нечего — иначе страница зависла бы скрытой до CSS-страховки.
// Совпадение с resolveLang проверяет langResolve.test.ts (прогоняет эту
// строку в vm на той же матрице случаев). Держать ES5 и без внешних имён.
export const LANG_BOOT_SCRIPT = `(function(){try{
var d=document,h=d.documentElement;
function ok(x){return x==='ru'||x==='kk'||x==='en'}
var p=d.location.pathname,r=/^\\/(?:tools|guides)\\/(kk|en)(?:\\/|$)/.exec(p);
if(r){h.setAttribute('lang',r[1]);return}
var v=null,m=/(?:^|;\\s*)lang=([^;]*)/.exec(d.cookie);
if(m&&ok(m[1]))v=m[1];
if(!v){try{var s=localStorage.getItem('lang');if(ok(s))v=s}catch(e){}}
if(!v){
var n=navigator;
if(!/${BOT_UA.source}/i.test(n.userAgent||'')){
var a=n.languages&&n.languages.length?n.languages:[n.language];
for(var i=0;i<a.length;i++){var t=String(a[i]||'').toLowerCase().split(/[-_]/)[0];if(ok(t)){v=t;break}}
}
}
if(!v)v='ru';
h.setAttribute('lang',v);
if(v!=='ru'&&!h.hasAttribute('data-lang-ready'))h.setAttribute('data-lang-hold','')
}catch(e){}})();`

// Скрывает текст только пока идёт определение языка у не-русского посетителя.
// Кадр 0 -> visibility:hidden; через 3 с анимация сама открывает страницу, даже
// если скрипт провайдера не отработал.
export const LANG_HOLD_CSS =
  'html[data-lang-hold] body{visibility:hidden;animation:ikz-lang-reveal 0s linear 3s forwards}' +
  '@keyframes ikz-lang-reveal{to{visibility:visible}}'
