/*
 * Отправка Reel на одобрение в Telegram.
 *
 *   node scripts/send-reel-draft.cjs <video.mp4> --caption-file <caption.txt> [--cover cover.jpg]
 *        [--note "заметка только для Telegram"] [--no-feed] [--url https://invoices.kz] [--dry-run]
 *
 * Что делает:
 *   1. Проверяет файл (mp4 + h264, <= 100 МБ, <= 90 с; через ffprobe, если он есть).
 *   2. Заливает mp4 (и обложку jpg) в публичный бакет Supabase 'instagram-drafts',
 *      папка reels/, service-ключом из .env.local.
 *   3. POST /api/instagram/draft на боевой сайт с секретом IG_AUTOMATION_SECRET.
 *      В Telegram приходит видео с кнопками «Опубликовать»/«Отклонить».
 *      Публикует только нажатие кнопки основателем; скрипт ничего не публикует сам.
 *
 * Секреты читаются из .env.local и нигде не печатаются.
 * --dry-run: всё проверяет и печатает план, но не заливает и не отправляет.
 */
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const MAX_BYTES = 100 * 1024 * 1024
const MAX_SECONDS = 90
const MIN_SECONDS = 3
const MAX_COVER_BYTES = 8 * 1024 * 1024
const CAPTION_MAX = 2200
const BUCKET = 'instagram-drafts'
const DEFAULT_SITE = 'https://invoices.kz' // канонический хост без www

function parseArgs(argv) {
  const out = { flags: {}, positional: [] }
  const withValue = new Set(['caption-file', 'cover', 'note', 'url'])
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      if (withValue.has(key)) {
        const v = argv[++i]
        if (v === undefined) die(`Для --${key} нужно значение`)
        out.flags[key] = v
      } else {
        out.flags[key] = true
      }
    } else {
      out.positional.push(a)
    }
  }
  return out
}

function die(msg) {
  console.error('Ошибка: ' + msg)
  process.exit(1)
}

// Читает .env.local, не печатая значения.
function loadEnv(file) {
  const env = {}
  if (!fs.existsSync(file)) return env
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq < 1) continue
    env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
  }
  return env
}

function probeVideo(file) {
  const r = spawnSync(
    'ffprobe',
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file],
    { encoding: 'utf8', timeout: 30000 },
  )
  if (r.error || r.status !== 0) return null
  try {
    return JSON.parse(r.stdout)
  } catch {
    return null
  }
}

// Возвращает { errors: [], warnings: [], info: {} }.
// probe -- подмена ffprobe для тестов.
function checkVideo(file, probe_ = probeVideo) {
  const errors = []
  const warnings = []
  const info = {}
  const ext = path.extname(file).toLowerCase()
  if (ext !== '.mp4') errors.push(`Ожидается .mp4, а не ${ext || 'файл без расширения'}`)
  const size = fs.statSync(file).size
  info.sizeMB = +(size / 1024 / 1024).toFixed(1)
  if (size > MAX_BYTES) errors.push(`Файл ${info.sizeMB} МБ, лимит ${MAX_BYTES / 1024 / 1024} МБ`)
  if (size === 0) errors.push('Файл пустой')

  const probe = probe_(file)
  if (!probe) {
    warnings.push('ffprobe недоступен или не смог прочитать файл: кодек и длительность НЕ проверены (проверены только расширение и размер)')
    return { errors, warnings, info }
  }
  const video = (probe.streams || []).find(s => s.codec_type === 'video')
  const audio = (probe.streams || []).find(s => s.codec_type === 'audio')
  if (!video) {
    errors.push('В файле нет видеодорожки')
    return { errors, warnings, info }
  }
  const duration = Number(probe.format && probe.format.duration)
  info.codec = video.codec_name
  info.pixFmt = video.pix_fmt
  info.size = `${video.width}x${video.height}`
  info.durationSec = Number.isFinite(duration) ? +duration.toFixed(1) : null
  info.audio = audio ? audio.codec_name : 'нет'

  if (video.codec_name !== 'h264') errors.push(`Видеокодек ${video.codec_name}, нужен h264`)
  if (video.pix_fmt && video.pix_fmt !== 'yuv420p') warnings.push(`pix_fmt ${video.pix_fmt}: Instagram ждёт 4:2:0 (yuv420p)`)
  if (info.durationSec === null) warnings.push('Длительность не определена')
  else {
    if (info.durationSec > MAX_SECONDS) errors.push(`Длительность ${info.durationSec} с, лимит скрипта ${MAX_SECONDS} с`)
    if (info.durationSec < MIN_SECONDS) errors.push(`Длительность ${info.durationSec} с, Instagram требует от ${MIN_SECONDS} с`)
  }
  if (audio && audio.codec_name !== 'aac') warnings.push(`Аудио ${audio.codec_name}: Instagram ждёт AAC`)
  if (video.width && video.height && Math.abs(video.width / video.height - 9 / 16) > 0.02) {
    warnings.push(`Соотношение сторон ${video.width}x${video.height}, рекомендуется 9:16`)
  }
  const fps = (() => {
    const [a, b] = String(video.avg_frame_rate || '0/1').split('/').map(Number)
    return b ? a / b : 0
  })()
  if (fps && (fps < 23 || fps > 60)) warnings.push(`Частота кадров ${fps.toFixed(1)}: Instagram принимает 23-60`)
  return { errors, warnings, info }
}

function safeName(file, ext) {
  const base = path.basename(file, path.extname(file)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'reel'
  return `reels/${Date.now()}-${base.slice(0, 40)}${ext}`
}

async function uploadToBucket(env, objectPath, file, contentType) {
  const url = `${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/${BUCKET}/${objectPath}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': contentType,
      'x-upsert': 'false',
    },
    body: fs.readFileSync(file),
  })
  if (!res.ok) {
    let detail = ''
    try { detail = (await res.json()).message || '' } catch {}
    const hint = res.status === 413 ? ' (файл больше лимита Storage проекта Supabase; на бесплатном плане по умолчанию 50 МБ)' : ''
    die(`Загрузка ${objectPath} не удалась: HTTP ${res.status} ${detail}${hint}`)
  }
  return `${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/${BUCKET}/${objectPath}`
}

async function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2))
  if (flags.help || flags.h || positional.length !== 1 || !flags['caption-file']) {
    console.log('Использование: node scripts/send-reel-draft.cjs <video.mp4> --caption-file <caption.txt> [--cover cover.jpg] [--note "..."] [--no-feed] [--url https://invoices.kz] [--dry-run]')
    process.exit(flags.help || flags.h ? 0 : 1)
  }
  const dryRun = !!flags['dry-run']
  const videoFile = path.resolve(positional[0])
  if (!fs.existsSync(videoFile)) die(`Нет файла ${videoFile}`)

  const captionFile = path.resolve(flags['caption-file'])
  if (!fs.existsSync(captionFile)) die(`Нет файла подписи ${captionFile}`)
  const caption = fs.readFileSync(captionFile, 'utf8').replace(/^﻿/, '').trim()
  if (!caption) die('Подпись пустая')
  if (caption.length > CAPTION_MAX) die(`Подпись ${caption.length} символов, лимит ${CAPTION_MAX}`)

  let coverFile = null
  if (flags.cover) {
    coverFile = path.resolve(flags.cover)
    if (!fs.existsSync(coverFile)) die(`Нет файла обложки ${coverFile}`)
    if (!/\.jpe?g$/i.test(coverFile)) die('Обложка должна быть JPEG (.jpg/.jpeg): так требует Instagram')
    if (fs.statSync(coverFile).size > MAX_COVER_BYTES) die('Обложка больше 8 МБ')
  }

  const check = checkVideo(videoFile)
  console.log('Видео:', JSON.stringify(check.info))
  for (const w of check.warnings) console.log('  предупреждение:', w)
  if (check.errors.length) {
    for (const e of check.errors) console.error('  ОШИБКА:', e)
    process.exit(1)
  }

  const env = loadEnv(path.resolve(__dirname, '..', '.env.local'))
  const missing = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'IG_AUTOMATION_SECRET'].filter(k => !env[k])
  if (missing.length) die(`В .env.local нет: ${missing.join(', ')}`)

  const site = String(flags.url && flags.url !== true ? flags.url : DEFAULT_SITE).replace(/\/$/, '')
  if (!/^https:\/\//.test(site) && !/^http:\/\/localhost(:\d+)?$/.test(site)) die('--url должен быть https (или http://localhost)')
  const videoObject = safeName(videoFile, '.mp4')
  const coverObject = coverFile ? safeName(coverFile, '.jpg') : null
  const payloadPreview = {
    videoUrl: `<${BUCKET}/${videoObject}>`,
    coverUrl: coverObject ? `<${BUCKET}/${coverObject}>` : undefined,
    caption: `${caption.length} симв.: ${caption.slice(0, 60).replace(/\s+/g, ' ')}${caption.length > 60 ? '...' : ''}`,
    mediaKind: 'reel',
    shareToFeed: !flags['no-feed'],
    note: flags.note && flags.note !== true ? flags.note : undefined,
  }

  if (dryRun) {
    console.log('\n[dry-run] ничего не загружено и не отправлено. План:')
    console.log(`  1. залить ${path.basename(videoFile)} (${check.info.sizeMB} МБ) в бакет ${BUCKET}/${videoObject}`)
    if (coverObject) console.log(`  2. залить обложку ${path.basename(coverFile)} в ${BUCKET}/${coverObject}`)
    console.log(`  3. POST ${site}/api/instagram/draft (заголовок x-internal-secret из .env.local)`)
    console.log('     тело:', JSON.stringify(payloadPreview, null, 2).replace(/\n/g, '\n     '))
    return
  }

  console.log('Заливаю видео...')
  const videoUrl = await uploadToBucket(env, videoObject, videoFile, 'video/mp4')
  let coverUrl
  if (coverFile) {
    console.log('Заливаю обложку...')
    coverUrl = await uploadToBucket(env, coverObject, coverFile, 'image/jpeg')
  }

  console.log('Отправляю черновик...')
  const res = await fetch(`${site}/api/instagram/draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': env.IG_AUTOMATION_SECRET },
    body: JSON.stringify({
      videoUrl,
      coverUrl,
      caption,
      mediaKind: 'reel',
      shareToFeed: !flags['no-feed'],
      note: flags.note && flags.note !== true ? flags.note : undefined,
    }),
    redirect: 'error', // редирект www/apex потерял бы заголовок с секретом
  })
  let data = null
  try { data = await res.json() } catch {}
  if (!res.ok) {
    die(`Черновик не создан: HTTP ${res.status} ${data && data.error ? data.error : ''}`.trim())
  }
  console.log('Готово. Черновик создан:', JSON.stringify({ id: data.id, telegram: data.telegram, videoUrl: data.videoUrl }))
  if (!data.telegram) console.log('  Внимание: сообщение в Telegram не ушло (нет TELEGRAM_* на сервере или Telegram ответил ошибкой).')
  console.log('Дальше: нажмите «Опубликовать» в Telegram. Публикация и обработка видео в Instagram занимают до пары минут.')
}

// Запуск только из командной строки; при require() (тесты) ничего не выполняется.
if (require.main === module) {
  main().catch(err => {
    console.error('Ошибка:', err && err.message ? err.message : err)
    process.exit(1)
  })
}

module.exports = { parseArgs, loadEnv, checkVideo, safeName, MAX_BYTES, MAX_SECONDS, MIN_SECONDS }
