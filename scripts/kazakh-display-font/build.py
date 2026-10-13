# -*- coding: utf-8 -*-
"""
Казахские буквы для Unbounded 700 — «заплатка»-шрифт.

У Unbounded нет ни одной специфической казахской буквы (Ә Ғ Қ Ң Ө Ұ Ү Һ),
браузер подставляет их из Arial — отсюда «прыгающие» буквы в казахском
заголовке. Строим 16 глифов из собственных деталей Unbounded:
  Ә ә Ө ө   — готовые латинские Ə ə Ɵ ɵ (их нарисовал сам дизайнер шрифта);
  Ү һ       — копии Y и h;
  Һ         — Ч, повёрнутая на 180°;
  Қ қ Ң ң   — К к Н н + хвост-нижний выносной элемент с геометрией хвоста Ц/ц;
  Ғ ғ       — Г г + горизонтальная перекладина толщиной дефиса;
  Ұ         — Y + перекладина на ножке;
  ү ұ       — v + вертикальная ножка до глубины выносного «у» (+ перекладина у ұ).
Шрифт подключается через @font-face c unicode-range только на эти коды и
ставится ПЕРВЫМ в font-family: для всех прочих символов браузер его
пропускает и берёт обычный Unbounded.

Лицензия: Unbounded — SIL OFL 1.1 без Reserved Font Name; производный шрифт
распространяется под той же лицензией (public/fonts/kazakh-display/OFL.txt).

Пересборка (13.10.2026 собрано именно так):
  pip install fonttools brotli skia-pathops
  curl -L -o Unbounded-var.ttf "https://raw.githubusercontent.com/google/fonts/main/ofl/unbounded/Unbounded%5Bwght%5D.ttf"
  python scripts/kazakh-display-font/build.py Unbounded-var.ttf public/fonts/kazakh-display/ikz-kazakh-display-700
Замеры ниже сняты с Unbounded 700 — при смене начертания пересчитать.
"""
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.ttLib.removeOverlaps import removeOverlaps

SRC = sys.argv[1] if len(sys.argv) > 1 else 'Unbounded-var.ttf'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'ikz-kazakh-display-700'

src = TTFont(SRC)
if 'fvar' in src:
    src = instancer.instantiateVariableFont(src, {'wght': 700})
gs = src.getGlyphSet()
cm = src.getBestCmap()
hm = src['hmtx']


def N(ch):
    return cm[ord(ch)]


class G:
    """Глиф: детали исходного шрифта + прямоугольники; контуры по часовой (как у оригинала)."""

    def __init__(self):
        self.pen = TTGlyphPen(None)

    def add(self, name, dx=0.0, dy=0.0, tr=None):
        rec = DecomposingRecordingPen(gs)
        gs[name].draw(rec)
        rec.replay(TransformPen(self.pen, tr if tr else (1, 0, 0, 1, dx, dy)))
        return self

    def rect(self, x0, y0, x1, y1):
        p = self.pen
        p.moveTo((x0, y1)); p.lineTo((x1, y1)); p.lineTo((x1, y0)); p.lineTo((x0, y0)); p.closePath()
        return self

    def glyph(self):
        return self.pen.glyph()


# Замеры Unbounded 700 (единицы шрифта, UPM 1000): прописная ножка I = 207,
# строчная l = 205, дефис 269..430 (толщина горизонталей 161), хвост Ц:
# ширина 195 под правым краем ножки, глубина -151; хвост ц: 176 / -137;
# выносной у/y = -181; дно v плоское 268..501; ножка Y 358..566, развилка ~365.
H_BAR = (269, 430)            # горизонталь прописных = дефис
UC_TAIL = (195, -151)         # (ширина, низ) хвоста Ц
LC_TAIL = (176, -137)         # хвост ц
LC_STEM = 205
DESC_Y = -181                 # выносной у/y
OVER = 24                     # нахлёст добавок в тело буквы — сливается removeOverlaps

glyphs = {}
adv = {}


def put(name, g, advance):
    glyphs[name] = g.glyph()
    adv[name] = advance


# Ә ә Ө ө — латинские шва и перечёркнутое о, нарисованные автором шрифта
for cyr, lat in [('uni04D8', 'uni018F'), ('uni04D9', 'uni0259'), ('uni04E8', 'uni019F'), ('uni04E9', 'uni0275')]:
    put(cyr, G().add(lat), hm[lat][0])

# Ү = Y, һ = h — графически идентичны
put('uni04AE', G().add('Y'), hm['Y'][0])
put('uni04BB', G().add('h'), hm['h'][0])

# Ұ = Y + перекладина на ножке (ножка 358..566, развилка ~365)
put('uni04B0', G().add('Y').rect(358 - 130, 225 - 80, 566 + 130, 225 + 81), hm['Y'][0])

# Һ = Ч, повёрнутая на 180° вокруг центра её рамки (42..817 × 0..750)
put('uni04BA', G().add(N('Ч'), tr=(-1, 0, 0, -1, 42 + 817, 750)), hm[N('Ч')][0])

# Қ қ Ң ң — хвост под правым краем, геометрия хвоста Ц/ц
for name, base, right, (w, bottom) in [
    ('uni049A', N('К'), 875, UC_TAIL),
    ('uni049B', N('к'), 751, LC_TAIL),
    ('uni04A2', N('Н'), 868, UC_TAIL),
    ('uni04A3', N('н'), 734, LC_TAIL),
]:
    put(name, G().add(base).rect(right - w, bottom, right, OVER), hm[base][0])

# Ғ ғ — перекладина через ножку; буква сдвигается вправо, чтобы влезло
# левое плечо перекладины, ширина растёт на тот же сдвиг
put('uni0492', G().add(N('Г'), dx=50).rect(70 + 50 - 100, H_BAR[0], 277 + 50 + 170, H_BAR[1]), hm[N('Г')][0] + 50)
put('uni0493', G().add(N('г'), dx=64).rect(56 + 64 - 100, 268 - 80, 261 + 64 + 165, 268 + 81), hm[N('г')][0] + 64)

# ү = v + вертикальная ножка по центру плоского дна до глубины у
cx = (268 + 501) / 2
put('uni04AF', G().add('v').rect(cx - LC_STEM / 2, DESC_Y, cx + LC_STEM / 2, OVER), hm['v'][0])
# ұ = ү + перекладина на ножке (тоньше прописной — выносной у Unbounded короткий)
put('uni04B1', G().add('v').rect(cx - LC_STEM / 2, DESC_Y, cx + LC_STEM / 2, OVER)
    .rect(cx - LC_STEM / 2 - 110, -150, cx + LC_STEM / 2 + 110, -40), hm['v'][0])

CMAP = {
    0x0492: 'uni0492', 0x0493: 'uni0493', 0x049A: 'uni049A', 0x049B: 'uni049B',
    0x04A2: 'uni04A2', 0x04A3: 'uni04A3', 0x04AE: 'uni04AE', 0x04AF: 'uni04AF',
    0x04B0: 'uni04B0', 0x04B1: 'uni04B1', 0x04BA: 'uni04BA', 0x04BB: 'uni04BB',
    0x04D8: 'uni04D8', 0x04D9: 'uni04D9', 0x04E8: 'uni04E8', 0x04E9: 'uni04E9',
}

notdef = G().add('.notdef') if '.notdef' in gs else G()
glyphs['.notdef'] = notdef.glyph()
adv['.notdef'] = hm['.notdef'][0] if '.notdef' in gs else 500

order = ['.notdef'] + sorted(CMAP.values())
fb = FontBuilder(1000, isTTF=True)
fb.setupGlyphOrder(order)
fb.setupCharacterMap(CMAP)
fb.setupGlyf(glyphs)
glyf = fb.font['glyf']
metrics = {}
for n in order:
    g = glyf[n]
    g.recalcBounds(glyf)
    metrics[n] = (int(round(adv[n])), int(getattr(g, 'xMin', 0) or 0))
fb.setupHorizontalMetrics(metrics)
hh = src['hhea']
fb.setupHorizontalHeader(ascent=hh.ascent, descent=hh.descent, lineGap=hh.lineGap)
os2 = src['OS/2']
fb.setupOS2(
    sTypoAscender=os2.sTypoAscender, sTypoDescender=os2.sTypoDescender, sTypoLineGap=os2.sTypoLineGap,
    usWinAscent=os2.usWinAscent, usWinDescent=os2.usWinDescent,
    sxHeight=os2.sxHeight, sCapHeight=os2.sCapHeight, usWeightClass=700,
    achVendID='IKZ ', fsType=0,
)
fb.setupNameTable({
    'familyName': 'IKZ Kazakh Display',
    'styleName': 'Bold',
    'copyright': 'Copyright 2022 The Unbounded Project Authors (https://github.com/googlefonts/unbounded). Kazakh glyphs derived 2026 by invoices.kz.',
    'licenseDescription': 'This Font Software is licensed under the SIL Open Font License, Version 1.1.',
    'licenseInfoURL': 'https://openfontlicense.org',
})
fb.setupPost()
removeOverlaps(fb.font)
fb.font.save(OUT + '.ttf')
fb.font.flavor = 'woff2'
fb.font.save(OUT + '.woff2')
import os
print('glyphs', len(order) - 1, '| ttf', os.path.getsize(OUT + '.ttf'), 'B | woff2', os.path.getsize(OUT + '.woff2'), 'B')
