'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/components/LanguageProvider'
import { toolRequisitesOfferDict } from '@/lib/i18n/toolRequisitesOffer'
import { loadRequisites, type Requisites } from '@/lib/tools-i18n/requisites'
import { hasToolOffer, planToolRequisites, saveToolRequisites, type ProfileLike } from '@/lib/tools-i18n/saveToolRequisites'
import { claimAndAnnounceBonus } from '@/lib/profileBonusClient'

// Карточка в /create для человека, который сделал бесплатный счёт, КП, акт или накладную в /tools и
// зарегистрировался: его реквизиты и банковский счёт уже лежат в этом браузере (requisites.ts).
// Одно нажатие сохраняет их в кабинет (проверки БИН и ИИК те же, что на страницах реквизитов и
// банков), и счёт можно выставлять без двух походов по профилю. Данные не уходят из браузера до
// нажатия. Показывается, только пока в кабинете нет реквизитов или банковского счёта и есть что
// предложить; после сохранения исчезает сама. Пустые поля страниц «Реквизиты» и «Банки» при этом
// подставляются отдельно (requisitesHandoff.ts), так что ручной путь остаётся.

export default function ToolRequisitesOffer({ profile, profileLoaded, bankCount, banksLoaded, onSaved }: {
  profile: ProfileLike
  profileLoaded: boolean
  bankCount: number
  banksLoaded: boolean
  onSaved: () => void
}) {
  const { lang } = useLanguage()
  const t = toolRequisitesOfferDict[lang]
  const [req, setReq] = useState<Requisites | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // localStorage читается только после монтирования (гидратация), в try/catch внутри loadRequisites.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReq(loadRequisites())
  }, [])

  if (!req || !profileLoaded || !banksLoaded) return null
  const plan = planToolRequisites(profile, bankCount, req)
  if (!hasToolOffer(plan, profile)) return null

  const company = plan.profileFill.company_name ?? profile?.company_name ?? ''
  const bin = plan.profileFill.bin_iin ?? profile?.bin_iin ?? ''
  const showCompany = plan.needProfile && !!company && !!bin

  async function save() {
    if (!req) return
    setBusy(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError(t.errGeneric); return }
      const result = await saveToolRequisites(supabase, user.id, profile, bankCount, req)
      if (!result.ok) {
        setError(result.reason === 'bin' ? t.errBin : result.reason === 'iik' ? t.errIik : t.errGeneric)
        return
      }
      // Бонус за заполненный профиль: сервер сам перепроверяет БИН и ИИК, ответ не ждём (как на страницах профиля).
      void claimAndAnnounceBonus('requisites', lang).then(r => {
        if (r?.credited || r?.alreadyClaimed) return claimAndAnnounceBonus('bank', lang)
      })
      onSaved()
    } catch {
      setError(t.errGeneric)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-4 rounded-xl p-4" style={{ background: 'var(--nav-accent-soft)', border: '1px solid var(--nav-border)' }}>
      <div className="text-[13px] font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{t.title}</div>
      <div className="text-[12px] mt-1.5 space-y-0.5" style={{ color: 'var(--nav-text-secondary)' }}>
        {showCompany && <div>{t.company(company, bin)}</div>}
        {plan.bank && <div>{t.bank(plan.bank.bank_name, plan.bank.iik.slice(-4))}</div>}
      </div>
      <div className="mt-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="rounded-xl px-4 py-2.5 text-[13px] font-semibold min-h-11 transition-colors disabled:opacity-60"
          style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}
        >
          {busy ? t.saving : t.saveButton}
        </button>
      </div>
      {error && <div className="text-[12px] mt-2" style={{ color: 'var(--nav-critical)' }} role="alert">{error}</div>}
    </div>
  )
}
