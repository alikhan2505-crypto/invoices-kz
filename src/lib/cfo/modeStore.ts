// Режим кабинета для меню: меню (SiteNav) живёт вне CfoWorkspace, поэтому режим
// передаётся через этот маленький стор — localStorage + событие окна.
import { useSyncExternalStore } from 'react'
import type { CfoMode } from './mode'

const KEY = 'cfo-mode'
const EVENT = 'cfo-mode-change'

export function publishCfoMode(mode: CfoMode): void {
  try { localStorage.setItem(KEY, mode) } catch { /* хранилище недоступно — меню просто останется «бизнесовым» */ }
  window.dispatchEvent(new Event(EVENT))
}

function read(): CfoMode {
  try { return localStorage.getItem(KEY) === 'family' ? 'family' : 'business' } catch { return 'business' }
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(EVENT, cb)
  window.addEventListener('storage', cb)
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener('storage', cb) }
}

export function useCfoMode(): CfoMode {
  return useSyncExternalStore(subscribe, read, () => 'business')
}
