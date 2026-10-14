'use client'

// Декоративный «Kaspi QR» для сценок: настоящий QR тут не нужен (и не
// должен сканироваться), поэтому узор детерминированный -- три «глаза»
// по углам и псевдослучайные модули из фиксированного зерна. Один <path>
// на весь узор, считается один раз на модуль.
const N = 21

function buildPath() {
  let seed = 2461
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  const inFinder = (x: number, y: number) =>
    (x < 8 && y < 8) || (x > N - 9 && y < 8) || (x < 8 && y > N - 9)
  const inLogo = (x: number, y: number) => x >= 8 && x <= 12 && y >= 8 && y <= 12
  let d = ''
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (inFinder(x, y) || inLogo(x, y)) continue
      if (rnd() > 0.52) d += `M${x} ${y}h1v1h-1z`
    }
  }
  // глаза: кольцо 7x7 + ядро 3x3
  for (const [fx, fy] of [[0, 0], [N - 7, 0], [0, N - 7]] as const) {
    d += `M${fx} ${fy}h7v7h-7zM${fx + 1} ${fy + 1}v5h5v-5z`
    d += `M${fx + 2} ${fy + 2}h3v3h-3z`
  }
  return d
}

const QR_PATH = buildPath()

export function PseudoQr({ className, ink = '#0a0d1f' }: { className?: string; ink?: string }) {
  return (
    <svg className={className} viewBox={`-1 -1 ${N + 2} ${N + 2}`} aria-hidden="true" shapeRendering="crispEdges">
      <rect x="-1" y="-1" width={N + 2} height={N + 2} rx="1.6" fill="#fff" />
      <path d={QR_PATH} fill={ink} fillRule="evenodd" />
      {/* центр -- красная «плашка» Kaspi, как на настоящих Kaspi QR */}
      <rect x="8.4" y="8.4" width="4.2" height="4.2" rx="1.1" fill="#F14635" shapeRendering="geometricPrecision" />
    </svg>
  )
}
