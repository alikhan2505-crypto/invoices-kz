// Снимок страницы через настоящий Chrome (CDP), без расширения и без Playwright.
// node scripts/qa-shot.mjs <url> <out.png> <width> <height> <dark:0|1> [css-селектор]
// Эмулирует телефон (width < 600) или компьютер и тему; с селектором прокручивает к элементу.
// Завели 15.11.2026, когда claude-in-chrome не отвечал: нужен только установленный Chrome и Node 22+.
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const [url, out, W, H, dark, selector] = process.argv.slice(2)
const CH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const port = 9300 + Math.floor(Math.random() * 500)
const prof = mkdtempSync(join(tmpdir(), 'qa-'))
const p = spawn(CH, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' })
const sleep = ms => new Promise(r => setTimeout(r, ms))
let list
for (let i = 0; i < 50; i++) { try { list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (list.length) break } catch {} await sleep(200) }
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r))
let id = 0; const pending = new Map()
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } })
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const mobile = Number(W) < 600
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: mobile ? 2 : 1, mobile })
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark === '1' ? 'dark' : 'light' }] })
await send('Page.navigate', { url })
await sleep(7000)
const ev = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value
if (selector) {
  await ev(`(()=>{const el=document.querySelector(${JSON.stringify(selector)}); if(el) el.scrollIntoView({block:'center'}); return !!el})()`)
  await sleep(800)
}
const info = await ev(`JSON.stringify({sw:document.documentElement.scrollWidth, cw:document.documentElement.clientWidth, theme:getComputedStyle(document.body).backgroundColor})`)
console.log(info)
const shot = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(out, Buffer.from(shot.result.data, 'base64'))
ws.close(); p.kill()
