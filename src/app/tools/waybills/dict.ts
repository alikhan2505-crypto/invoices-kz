import type { ToolLang, ToolSeoCopy } from '@/lib/tools-i18n'

// Все тексты /tools/waybills на трёх языках: и <head> (seo), и интерфейс.
// Сами накладные не переводятся и не меняются — это PDF, который выдал Kaspi,
// мы только раскладываем их по листам. С 15.10.2026 у склейки лимит («5 → сразу
// Про»): 5 в календарный месяц на IP всем, у кого нет Kaspi Bot, — регистрация
// ничего не добавляет; без ограничений — только в Kaspi Bot на тарифе Про.
// Заголовки и описания, где раньше было «без регистрации» без оговорок, — честно.

// Дата обнуления месяца словами: '2026-11-01' → «1 ноября» / «1 қарашада» /
// «1 November». Месяц всегда начинается первого числа.
const MONTHS: Record<ToolLang, string[]> = {
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
  kk: ['қаңтарда', 'ақпанда', 'наурызда', 'сәуірде', 'мамырда', 'маусымда', 'шілдеде', 'тамызда', 'қыркүйекте', 'қазанда', 'қарашада', 'желтоқсанда'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
}

export function monthStartLabel(lang: ToolLang, iso: string): string {
  const s = String(iso)
  const month = s.slice(8, 10) === '01' ? MONTHS[lang][Number(s.slice(5, 7)) - 1] : undefined
  return month ? `1 ${month}` : s
}

export interface WaybillsDict {
  seo: ToolSeoCopy
  h1: string
  intro: string
  dropzoneTitle: string
  dropzoneActive: string
  dropzoneHint: (max: number) => string
  dropzoneAria: string
  unpacking: string
  filesCount: (n: number) => string
  clear: string
  removeFile: (name: string) => string
  fileLimit: (max: number) => string
  duplicates: (n: number) => string
  fileTooBig: (name: string) => string
  formatLegend: string
  formatA4: string
  formatA4Hint: string
  formatA6: string
  formatA6Hint: string
  invalidFiles: string
  zipEmpty: string
  zipBroken: string
  errTooMany: string
  errTooLarge: string
  errUnreadable: string
  errGeneric: string
  networkError: string
  /** 503 от склейки: счётчик лимита не читается. */
  errUnavailable: string
  /** Подсказка под кнопкой для всех без Kaspi Bot (и без входа, и вошедшим на Free/Базовом/триале): «Осталось 3 из 5 бесплатных склеек в этом месяце». */
  remaining: (n: number, limit: number) => string
  /** Подсказка под кнопкой для того, у кого есть Kaspi Bot (Про или админ). */
  unlimited: string
  limitTitle: (limit: number) => string
  /** resetsAt — ISO первого дня следующего месяца ('2026-11-01'); пусто — без даты. */
  limitText: (resetsAt: string) => string
  limitCta: string
  merge: string
  merging: string
  done: (files: number, sheets: number) => string
  howTitle: string
  steps: [string, string, string]
  faqTitle: string
  faq: Array<{ q: string; a: string }>
  ctaTitle: string
  ctaBody: string
  ctaLink: string
  leadPrompt: string
  leadPlaceholder: string
  leadAria: string
  leadSubmit: string
  leadSending: string
  leadThanks: string
}

/** 1 накладная, 2 накладные, 5 накладных. */
export function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

const pluralEn = (n: number, word: string) => (n === 1 ? word : `${word}s`)

export const waybillsDict: Record<ToolLang, WaybillsDict> = {
  ru: {
    seo: {
      title: 'Печать накладных Kaspi одним PDF (А4/А6)',
      description:
        'Печать накладных Kaspi Магазина одним PDF: по 4 на лист А4 или по одной в А6 для термопринтера. 5 склеек в месяц бесплатно, без ограничений — в Kaspi Bot (Про). Файлы нигде не сохраняются.',
      keywords:
        'печать накладных kaspi одним pdf, склейка накладных kaspi, печать накладных kaspi магазин, накладные 4 на лист а4, накладные а6 термопринтер, объединить pdf накладные, kaspi магазин накладные распечатать',
      ogTitle: 'Печать накладных Kaspi одним PDF (А4/А6)',
      ogDescription:
        'Накладные Kaspi одним PDF: по 4 на лист А4 или по одной в А6 на термопринтер. 5 склеек в месяц бесплатно, без ограничений — в Kaspi Bot (Про).',
      ogImageAlt: 'Печать накладных Kaspi одним PDF (А4/А6) — invoices.kz',
    },
    h1: 'Печать накладных Kaspi одним PDF (А4/А6)',
    intro:
      'Соберите накладные из Kaspi Магазина в один PDF и распечатайте разом, не печатая каждую отдельно: по 4 на лист А4 для обычного принтера или по одной в А6, если у вас есть термопринтер. Бесплатно и без регистрации — 5 склеек в месяц, без ограничений — в Kaspi Bot на тарифе Про. Файлы нигде не сохраняются.',
    dropzoneTitle: 'Выберите PDF-накладные или ZIP-архив',
    dropzoneActive: 'Отпустите файлы здесь',
    dropzoneHint: max => `нажмите здесь или перетащите файлы · до ${max} файлов`,
    dropzoneAria: 'Выбрать PDF-файлы накладных или ZIP-архив',
    unpacking: 'Распаковываем архив…',
    filesCount: n => `Файлов: ${n}`,
    clear: 'Очистить',
    removeFile: name => `Убрать ${name}`,
    fileLimit: max => `Можно склеить не больше ${max} файлов за раз — лишние не добавлены`,
    duplicates: n => `Повторы пропущены: ${n}`,
    fileTooBig: name => `Файл «${name}» больше 5 МБ — он не добавлен`,
    formatLegend: 'Формат печати',
    formatA4: 'А4 — 4 на лист',
    formatA4Hint: 'обычный принтер',
    formatA6: 'А6 — по одной',
    formatA6Hint: 'термопринтер',
    invalidFiles: 'Выберите PDF-накладные или ZIP-архив, который отдал Kaspi.',
    zipEmpty: 'В архиве не нашлось PDF-накладных.',
    zipBroken: 'Не удалось открыть ZIP-архив. Скачайте его из Kaspi заново или загрузите PDF-файлы из него.',
    errTooMany: 'Слишком много запросов подряд. Попробуйте через несколько минут.',
    errTooLarge: 'Файлы слишком большие в сумме. Склейте накладные в два-три захода.',
    errUnreadable: 'Не удалось прочитать один из файлов. Убедитесь, что загружаете именно PDF-накладные из Kaspi.',
    errGeneric: 'Не удалось склеить файлы',
    networkError: 'Ошибка сети. Проверьте соединение и попробуйте ещё раз.',
    errUnavailable: 'Не удалось проверить лимит склеек. Попробуйте через минуту.',
    remaining: (n, limit) =>
      `${n === 1 ? 'Осталась' : 'Осталось'} ${n} из ${limit} ${pluralRu(limit, 'бесплатной склейки', 'бесплатных склеек', 'бесплатных склеек')} в этом месяце`,
    unlimited: 'Kaspi Bot на тарифе Про — склейка без ограничений',
    limitTitle: limit => `Все ${limit} бесплатных склеек в этом месяце использованы`,
    limitText: iso =>
      `${iso ? `Новые бесплатные склейки откроются ${monthStartLabel('ru', iso)}. ` : ''}Без ограничений — в Kaspi Bot на тарифе Про: там накладные приходят из Kaspi сами, без скачивания и склейки.`,
    limitCta: 'Подключить Kaspi Bot',
    merge: 'Склеить и скачать PDF',
    merging: 'Склеиваем…',
    done: (files, sheets) =>
      `Готово: ${files} ${pluralRu(files, 'накладная', 'накладные', 'накладных')} на ${sheets} ${pluralRu(sheets, 'листе', 'листах', 'листах')} — файл скачан.`,
    howTitle: 'Как это работает',
    steps: [
      'Скачайте накладные в кабинете Kaspi Магазина — PDF-файлами или ZIP-архивом.',
      'Загрузите их сюда целиком, архив распаковывать не нужно. До 30 накладных за раз.',
      'Выберите А4 или А6 и скачайте один готовый PDF для печати.',
    ],
    faqTitle: 'Частые вопросы',
    faq: [
      {
        q: 'Где взять накладные в Kaspi?',
        a: 'В кабинете Kaspi Магазина накладная появляется после того, как упаковка завершена и заказ перешёл в «Передачу». Если Kaspi отдал ZIP-архив — загрузите его сюда как есть.',
      },
      {
        q: 'А4 или А6 — что выбрать?',
        a: 'А4 — для обычного офисного принтера: 4 накладные на листе, потом лист разрезается на четыре. А6 — для термопринтера этикеток: по одной накладной на этикетку.',
      },
      {
        q: 'Куда попадают мои файлы?',
        a: 'Никуда. Файлы склеиваются в памяти сервера и сразу возвращаются вам — мы их не сохраняем. ZIP-архив распаковывается прямо в вашем браузере.',
      },
      {
        q: 'Есть ли ограничения?',
        a: '5 склеек в месяц с одной сети (IP) — бесплатно и без регистрации. Регистрация лимит не меняет. Без ограничений — в Kaspi Bot на тарифе Про: там накладные приходят из Kaspi сами. Лимит обновляется 1-го числа.',
      },
      {
        q: 'Сколько накладных можно склеить за раз?',
        a: 'До 30. Если заказов больше — склейте их в несколько заходов.',
      },
    ],
    ctaTitle: 'Хотите, чтобы накладные забирались из Kaspi сами?',
    ctaBody:
      'В invoices.kz накладные подтягиваются прямо из вашего кабинета Kaspi — вместе с заказами, демпингом цен с защитой минимальной цены, финансами и аналитикой ниш.',
    ctaLink: 'Посмотреть Kaspi Bot →',
    leadPrompt: 'Хотите узнавать о новых бесплатных инструментах?',
    leadPlaceholder: 'Email или телефон (необязательно)',
    leadAria: 'Email или телефон',
    leadSubmit: 'Отправить',
    leadSending: 'Отправляем…',
    leadThanks: 'Спасибо! Дадим знать, когда выйдет что-то новое.',
  },

  kk: {
    seo: {
      title: 'Kaspi жүкқұжаттарын бір PDF-пен басып шығару (А4/А6)',
      description:
        'Kaspi Магазин жүкқұжаттарын бір PDF файлға біріктіріңіз: А4 парағына 4-тен немесе термопринтерге А6 форматында бір-бірден. Айына 5 рет тегін, шектеусіз — Про тарифіндегі Kaspi Bot-та. Файлдар ешқайда сақталмайды.',
      keywords:
        'kaspi жүкқұжаттарын бір pdf-пен басып шығару, kaspi жүкқұжат басып шығару, kaspi жүкқұжаттарын біріктіру, kaspi магазин жүкқұжат, жүкқұжат а4 парағына 4, жүкқұжат а6 термопринтер, pdf файлдарды біріктіру тегін, kaspi накладная басып шығару',
      ogTitle: 'Kaspi жүкқұжаттарын бір PDF-пен басып шығару (А4/А6)',
      ogDescription:
        'Kaspi жүкқұжаттары бір файлда: А4 парағына 4-тен немесе термопринтерге А6. Айына 5 рет тегін, шектеусіз — Kaspi Bot-та (Про).',
      ogImageAlt: 'Kaspi жүкқұжаттарын бір PDF-пен басып шығару (А4/А6) — invoices.kz',
    },
    h1: 'Kaspi жүкқұжаттарын бір PDF-пен басып шығару (А4/А6)',
    intro:
      'Kaspi Магазин жүкқұжаттарын әрқайсысын бөлек басып шығармас үшін бір PDF файлға жинаңыз: кәдімгі принтерге А4 парағына 4-тен немесе термопринтеріңіз болса, А6 форматында бір-бірден. Тегін және тіркелусіз — айына 5 рет, шектеусіз — Про тарифіндегі Kaspi Bot-та. Файлдар ешқайда сақталмайды.',
    dropzoneTitle: 'PDF-жүкқұжаттарды немесе ZIP-архивті таңдаңыз',
    dropzoneActive: 'Файлдарды осында тастаңыз',
    dropzoneHint: max => `осы жерді басыңыз немесе файлдарды сүйреп әкеліңіз · ${max} файлға дейін`,
    dropzoneAria: 'Жүкқұжаттардың PDF-файлдарын немесе ZIP-архивін таңдау',
    unpacking: 'Архивті ашып жатырмыз…',
    filesCount: n => `Файлдар: ${n}`,
    clear: 'Тазалау',
    removeFile: name => `${name} файлын алып тастау`,
    fileLimit: max => `Бір ретте ${max} файлдан артық біріктіруге болмайды — артығы қосылмады`,
    duplicates: n => `Қайталанған ${n} файл өткізіп жіберілді`,
    fileTooBig: name => `«${name}» файлы 5 МБ-тан үлкен — ол қосылмады`,
    formatLegend: 'Басып шығару форматы',
    formatA4: 'А4 — парақта 4',
    formatA4Hint: 'кәдімгі принтер',
    formatA6: 'А6 — бір-бірден',
    formatA6Hint: 'термопринтер',
    invalidFiles: 'PDF-жүкқұжаттарды немесе Kaspi берген ZIP-архивті таңдаңыз.',
    zipEmpty: 'Архивтен PDF-жүкқұжат табылмады.',
    zipBroken: 'ZIP-архивті ашу мүмкін болмады. Оны Kaspi-ден қайта жүктеп алыңыз немесе ішіндегі PDF-файлдарды жүктеңіз.',
    errTooMany: 'Қатарынан тым көп сұрау жіберілді. Бірнеше минуттан кейін қайталап көріңіз.',
    errTooLarge: 'Файлдардың жалпы көлемі тым үлкен. Жүкқұжаттарды екі-үш бөлікке бөліп біріктіріңіз.',
    errUnreadable: 'Файлдардың бірін оқу мүмкін болмады. Kaspi-ден алынған PDF-жүкқұжаттарды жүктеп отырғаныңызға көз жеткізіңіз.',
    errGeneric: 'Файлдарды біріктіру мүмкін болмады. Қайталап көріңіз.',
    networkError: 'Желі қатесі. Байланысты тексеріп, қайталап көріңіз.',
    errUnavailable: 'Біріктіру шегін тексеру мүмкін болмады. Бір минуттан кейін қайталап көріңіз.',
    remaining: (n, limit) => `Осы айда қалған тегін біріктіру: ${n} / ${limit}`,
    unlimited: 'Про тарифіндегі Kaspi Bot — біріктіру шектеусіз',
    limitTitle: limit => `Осы айдағы ${limit} тегін біріктірудің бәрі пайдаланылды`,
    limitText: iso =>
      `${iso ? `Жаңа тегін біріктірулер ${monthStartLabel('kk', iso)} ашылады. ` : ''}Шектеусіз — Про тарифіндегі Kaspi Bot-та: онда жүкқұжаттар Kaspi-ден өздігінен келеді, оларды жүктеп алып, біріктірудің қажеті жоқ.`,
    limitCta: 'Kaspi Bot-ты қосу',
    merge: 'Біріктіріп, PDF жүктеп алу',
    merging: 'Біріктіріп жатырмыз…',
    done: (files, sheets) => `Дайын: ${files} жүкқұжат ${sheets} параққа орналасты — файл жүктелді.`,
    howTitle: 'Қалай жұмыс істейді',
    steps: [
      'Kaspi Магазин кабинетінен жүкқұжаттарды жүктеп алыңыз — PDF-файлдар немесе ZIP-архив түрінде.',
      'Оларды осында тұтастай жүктеңіз, архивті ашудың қажеті жоқ. Бір ретте 30 жүкқұжатқа дейін.',
      'А4 немесе А6 форматын таңдап, басып шығаруға дайын бір PDF файлды жүктеп алыңыз.',
    ],
    faqTitle: 'Жиі қойылатын сұрақтар',
    faq: [
      {
        q: 'Kaspi-де жүкқұжатты қайдан алуға болады?',
        a: 'Kaspi Магазин кабинетінде жүкқұжат тапсырыс буып-түйіліп, «Передача» (тапсыру) кезеңіне өткенде пайда болады. Kaspi ZIP-архив берсе, оны осында сол күйінде жүктей беріңіз.',
      },
      {
        q: 'А4 әлде А6 — қайсысын таңдаған дұрыс?',
        a: 'А4 — кәдімгі кеңсе принтеріне: бір параққа 4 жүкқұжат, кейін парақты төртке қиясыз. А6 — заттаңба басатын термопринтерге: әр заттаңбаға бір жүкқұжат.',
      },
      {
        q: 'Файлдарым қайда сақталады?',
        a: 'Ешқайда. Файлдар сервер жадында біріктіріліп, бірден өзіңізге қайтарылады — біз оларды сақтамаймыз. ZIP-архив тікелей браузеріңізде ашылады.',
      },
      {
        q: 'Шектеу бар ма?',
        a: 'Бір желіден (IP мекенжайынан) айына 5 рет — тегін және тіркелусіз. Тіркелу шектеуді өзгертпейді. Шектеусіз — Про тарифіндегі Kaspi Bot-та: онда жүкқұжаттар Kaspi-ден өздігінен келеді. Шектеу әр айдың 1-күні жаңарады.',
      },
      {
        q: 'Бір ретте қанша жүкқұжат біріктіруге болады?',
        a: '30-ға дейін. Тапсырыс көп болса, бірнеше бөлікке бөліп біріктіріңіз.',
      },
    ],
    ctaTitle: 'Жүкқұжаттарды Kaspi-ден қолмен жүктемей-ақ алғыңыз келе ме?',
    ctaBody:
      'invoices.kz-те жүкқұжаттар Kaspi кабинетіңізден тікелей тартылады — тапсырыстармен, ең төменгі бағаны қорғайтын демпинг-ботпен, қаржы және ниша аналитикасымен бірге.',
    ctaLink: 'Kaspi Bot туралы толығырақ →',
    leadPrompt: 'Жаңа тегін құралдар туралы хабар алғыңыз келе ме?',
    leadPlaceholder: 'Email немесе телефон (міндетті емес)',
    leadAria: 'Email немесе телефон',
    leadSubmit: 'Жіберу',
    leadSending: 'Жіберілуде…',
    leadThanks: 'Рахмет! Жаңа құрал шыққанда хабарлаймыз.',
  },

  en: {
    seo: {
      title: 'Print Kaspi Waybills as One PDF (A4/A6) — Free Tool for Kazakhstan Sellers',
      description:
        'Merge Kaspi Shop waybills (shipping labels from the Kaspi.kz marketplace, Kazakhstan) into one PDF: 4 per A4 sheet or one per A6 label for a thermal printer. 5 free merges a month, unlimited in Kaspi Bot on the Pro plan. Files are never stored.',
      keywords:
        'print kaspi waybills one pdf, kaspi waybill print, merge kaspi waybills, kaspi shop shipping labels, kaspi.kz seller tools, merge pdf shipping labels a4, a6 thermal printer shipping label, kazakhstan marketplace seller tools',
      ogTitle: 'Print Kaspi Waybills as One PDF (A4/A6) — Free Online',
      ogDescription:
        'Kaspi waybills in a single file: 4 per A4 sheet or one per A6 label for a thermal printer. 5 free merges a month, unlimited in Kaspi Bot (Pro).',
      ogImageAlt: 'Print Kaspi Waybills as One PDF (A4/A6) — invoices.kz',
    },
    h1: 'Print Kaspi Waybills as One PDF (A4/A6)',
    intro:
      "Combine your Kaspi Shop waybills (the shipping labels of Kazakhstan's Kaspi.kz marketplace) into one PDF so you don't print each one separately: 4 per A4 sheet for a regular printer, or one per A6 label if you have a thermal printer. Free with no signup — 5 merges a month; unlimited in Kaspi Bot on the Pro plan. Files are never stored.",
    dropzoneTitle: 'Choose PDF waybills or a ZIP archive',
    dropzoneActive: 'Drop the files here',
    dropzoneHint: max => `tap here or drop files · up to ${max} files`,
    dropzoneAria: 'Choose waybill PDF files or a ZIP archive',
    unpacking: 'Unpacking the archive…',
    filesCount: n => `Files: ${n}`,
    clear: 'Clear',
    removeFile: name => `Remove ${name}`,
    fileLimit: max => `You can merge up to ${max} files at once — the extra ones weren't added`,
    duplicates: n => `${n} duplicate ${pluralEn(n, 'file')} skipped`,
    fileTooBig: name => `"${name}" is larger than 5 MB and wasn't added`,
    formatLegend: 'Print format',
    formatA4: 'A4 — 4 per sheet',
    formatA4Hint: 'regular printer',
    formatA6: 'A6 — one per label',
    formatA6Hint: 'thermal printer',
    invalidFiles: 'Choose PDF waybills or the ZIP archive Kaspi gave you.',
    zipEmpty: 'No PDF waybills found in the archive.',
    zipBroken: "Couldn't open the ZIP archive. Download it from Kaspi again or upload the PDF files inside it.",
    errTooMany: 'Too many requests in a row. Try again in a few minutes.',
    errTooLarge: 'The files are too large in total. Merge the waybills in two or three batches.',
    errUnreadable: "One of the files couldn't be read. Make sure you're uploading PDF waybills downloaded from Kaspi.",
    errGeneric: "Couldn't merge the files. Please try again.",
    networkError: 'Network error. Check your connection and try again.',
    errUnavailable: "Couldn't check the merge limit. Try again in a minute.",
    remaining: (n, limit) => `${n} of ${limit} free ${pluralEn(limit, 'merge')} left this month`,
    unlimited: 'Kaspi Bot on the Pro plan — unlimited merges',
    limitTitle: limit => `All ${limit} free merges for this month are used up`,
    limitText: iso =>
      `${iso ? `Your free merges reset on ${monthStartLabel('en', iso)}. ` : ''}For unlimited merges, use Kaspi Bot on the Pro plan: there the waybills come from Kaspi on their own, with nothing to download or merge.`,
    limitCta: 'Connect Kaspi Bot',
    merge: 'Merge and download PDF',
    merging: 'Merging…',
    done: (files, sheets) =>
      `Done: ${files} ${pluralEn(files, 'waybill')} on ${sheets} ${pluralEn(sheets, 'page')} — the file has been downloaded.`,
    howTitle: 'How it works',
    steps: [
      'Download the waybills from your Kaspi Shop seller cabinet — as PDF files or a ZIP archive.',
      'Upload them here as they are, no need to unpack the archive. Up to 30 waybills at a time.',
      'Pick A4 or A6 and download a single print-ready PDF.',
    ],
    faqTitle: 'FAQ',
    faq: [
      {
        q: 'Where do I get waybills in Kaspi?',
        a: 'In the Kaspi Shop seller cabinet a waybill appears once packing is finished and the order moves to «Передача» (Handover). If Kaspi gives you a ZIP archive, upload it here as is.',
      },
      {
        q: 'A4 or A6 — which should I choose?',
        a: 'A4 is for a regular office printer: 4 waybills per sheet, then you cut the sheet into four. A6 is for a thermal label printer: one waybill per label.',
      },
      {
        q: 'Where do my files go?',
        a: "Nowhere. The files are merged in server memory and sent straight back to you — we don't store them. A ZIP archive is unpacked right in your browser.",
      },
      {
        q: 'Are there any limits?',
        a: "5 merges a month per network (IP address) — free, no signup. Signing up doesn't change the limit. Unlimited merges come with Kaspi Bot on the Pro plan, where waybills arrive from Kaspi on their own. The limit resets on the 1st of every month.",
      },
      {
        q: 'How many waybills can I merge at once?',
        a: 'Up to 30. If you have more orders, merge them in several batches.',
      },
    ],
    ctaTitle: 'Want your waybills pulled from Kaspi automatically?',
    ctaBody:
      'invoices.kz pulls waybills straight from your Kaspi seller cabinet — along with orders, automatic repricing with a minimum-price guard, finances and niche analytics.',
    ctaLink: 'Learn about Kaspi Bot →',
    leadPrompt: 'Want to hear about new free tools?',
    leadPlaceholder: 'Email or phone (optional)',
    leadAria: 'Email or phone',
    leadSubmit: 'Send',
    leadSending: 'Sending…',
    leadThanks: "Thanks! We'll let you know when something new ships.",
  },
}
