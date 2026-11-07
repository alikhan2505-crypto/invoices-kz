// Помощники для тестов страниц /kaspi-shop/* в happy-dom (act, монтирование, клики,
// ввод). Сами vi.mock остаются в тестовых файлах: vitest поднимает их только оттуда.
// Не часть приложения.
import { createElement, act, type ComponentType } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let host: HTMLDivElement | null = null

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

export async function flush(rounds = 6) {
  for (let i = 0; i < rounds; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)) })
}

export async function mountPage(Component: ComponentType) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => { root!.render(createElement(Component)) })
  await flush()
}

export async function unmountPage() {
  if (root) await act(async () => { root!.unmount() })
  host?.remove()
  root = null
  host = null
}

export const pageText = () => (document.body.textContent || '').replace(/[\s  ]+/g, ' ')

export function byText(selector: string, needle: string): HTMLElement | null {
  return (Array.from(document.body.querySelectorAll(selector)) as HTMLElement[]).find(e => (e.textContent || '').includes(needle)) || null
}

export async function click(el: Element | null | undefined) {
  if (!el) throw new Error('element not found')
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  await flush()
}

export async function typeInto(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  await act(async () => {
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** Ждёт условия (с реальными таймерами), прокручивая act; бросает по истечении timeoutMs. */
export async function waitFor(cond: () => boolean, timeoutMs = 3000) {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: timeout')
    await act(async () => { await new Promise(r => setTimeout(r, 10)) })
  }
}
