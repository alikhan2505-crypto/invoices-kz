'use client'
import { useState } from 'react'

/** Фото с запасным блоком: CDN поставщика может не отвечать, пустой белый квадрат ничего не говорит. */
export default function SupplierPhoto({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false)
  if (failed || !src) {
    return (
      <div className="w-full aspect-square rounded-lg mb-2 flex items-center justify-center text-[11px]"
        style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-muted)', border: '1px solid var(--nav-border)' }}>
        Нет фото
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)}
      className="w-full aspect-square object-contain rounded-lg mb-2" style={{ background: '#fff' }} />
  )
}
