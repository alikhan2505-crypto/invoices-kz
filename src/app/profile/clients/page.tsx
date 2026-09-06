'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import Skeleton from '@/components/Skeleton'

// Same easing curve used across the redesigned app (see src/app/dashboard/page.tsx) --
// kept identical rather than inventing a second "house" ease.
const EASE = [0.16, 1, 0.3, 1] as const

const CARD_HOVER = 'transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[var(--nav-card-glow)]'

// Same input treatment as src/app/create/page.tsx's form fields.
const inputClass = 'w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]'

function ChevronLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 6-6 6 6 6" />
    </svg>
  )
}
function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}
function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}
function XIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}
function PencilIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}
function PeopleIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--nav-text-muted)' }}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 19c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5" />
      <path d="M16 4.3c1.5.4 2.6 1.7 2.6 3.3 0 1.6-1.1 2.9-2.6 3.3" />
      <path d="M15 13.7c2.7.5 4.5 2.4 4.5 5.3" />
    </svg>
  )
}

export default function Clients() {
  const router = useRouter()
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
  const [clients, setClients] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', bin_iin: '', email: '', address: '', phone: '' })

  useEffect(() => { loadClients() }, [])

  function formatPhone(value: string) {
    const digits = value.replace(/\D/g, '')
    if (digits.length === 0) return ''
    let result = '+7'
    if (digits.length > 1) result += ' ' + digits.slice(1, 4)
    if (digits.length > 4) result += ' ' + digits.slice(4, 7)
    if (digits.length > 7) result += ' ' + digits.slice(7, 11)
    return result
  }

  async function loadClients() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data } = await supabase.from('clients').select('*').eq('user_id', user.id).order('name')
    setClients(data || [])
    setLoading(false)
  }

  function startEdit(client: any) {
    setEditingId(client.id)
    setForm({
      name: client.name,
      bin_iin: client.bin_iin || '',
      email: client.email || '',
      address: client.address || '',
      phone: client.phone || ''
    })
    setShowForm(true)
  }

  function resetForm() {
    setEditingId(null)
    setForm({ name: '', bin_iin: '', email: '', address: '', phone: '' })
    setShowForm(false)
  }

  async function saveClient() {
    if (!form.name) { alert('Введите название'); return }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    if (editingId) {
      const { error } = await supabase.from('clients').update({ ...form }).eq('id', editingId)
      if (error) { alert('Ошибка: ' + error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('clients').insert({ ...form, user_id: user.id })
      if (error) { alert('Ошибка: ' + error.message); setSaving(false); return }
    }

    resetForm()
    loadClients()
    setSaving(false)
  }

  async function deleteClient(id: string) {
    if (!confirm('Удалить клиента?')) return
    await supabase.from('clients').delete().eq('id', id)
    setClients(prev => prev.filter(c => c.id !== id))
  }

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.bin_iin || '').includes(search) ||
    (c.email || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.address || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || '').includes(search)
  )

  return (
    <DesktopShell>
      <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
        <SiteNav />
        <div className="max-w-lg lg:max-w-3xl mx-auto p-4">
          <motion.div
            className="flex items-center justify-between gap-3 mb-5"
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => router.push('/profile')}
                aria-label="Назад"
                className="w-11 h-11 flex items-center justify-center rounded-xl flex-shrink-0 transition-colors hover:bg-[var(--nav-surface-glass)]"
                style={{ color: 'var(--nav-text-muted)' }}
              >
                <ChevronLeftIcon />
              </button>
              <h2 className="text-xl font-bold truncate" style={{ color: 'var(--nav-text-primary)' }}>Мои клиенты</h2>
            </div>
            {!showForm && (
              <button onClick={() => setShowForm(true)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg flex-shrink-0 transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0"
                style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                <PlusIcon />
                Добавить
              </button>
            )}
          </motion.div>

          <motion.div
            className="nav-glass rounded-xl px-3 py-2.5 flex items-center gap-2 mb-3"
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : 0.05 }}
          >
            <span className="flex-shrink-0" style={{ color: 'var(--nav-text-muted)' }}><SearchIcon /></span>
            <input
              className="flex-1 text-sm outline-none bg-transparent"
              placeholder="Поиск по названию, БИН, email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ color: 'var(--nav-text-primary)' }}
            />
            {search && (
              <button onClick={() => setSearch('')} aria-label="Очистить поиск"
                className="flex-shrink-0 text-[color:var(--nav-text-muted)] hover:text-[color:var(--nav-text-secondary)] transition-colors">
                <XIcon />
              </button>
            )}
          </motion.div>

          {!search && clients.length > 0 && (
            <div className="text-xs px-1 mb-3" style={{ color: 'var(--nav-text-muted)' }}>
              Всего клиентов: <span className="font-medium" style={{ color: 'var(--nav-text-primary)' }}>{clients.length}</span>
            </div>
          )}
          {search && (
            <div className="text-xs px-1 mb-3" style={{ color: 'var(--nav-text-muted)' }}>
              Найдено: <span className="font-medium" style={{ color: 'var(--nav-text-primary)' }}>{filtered.length}</span> из {clients.length}
            </div>
          )}

          {showForm && (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.3, ease: EASE }}
              className="nav-glass nav-card-accent rounded-2xl p-5 mb-4 space-y-3"
            >
              <div className="font-semibold text-sm mb-1" style={{ color: 'var(--nav-text-primary)' }}>
                {editingId ? 'Редактировать клиента' : 'Новый клиент'}
              </div>

              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>Название компании / ИП *</label>
                <input
                  className={inputClass}
                  placeholder="ТОО «Пример»"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>БИН / ИИН</label>
                <input
                  className={inputClass}
                  placeholder="123456789012"
                  value={form.bin_iin}
                  onChange={e => setForm({ ...form, bin_iin: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>Email</label>
                <input
                  className={inputClass}
                  placeholder="client@mail.kz"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>Адрес</label>
                <input
                  className={inputClass}
                  placeholder="г. Алматы, ул. Абая 1"
                  value={form.address}
                  onChange={e => setForm({ ...form, address: e.target.value })}
                />
              </div>

              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>Телефон</label>
                <input
                  className={inputClass}
                  placeholder="+7 776 355 5177"
                  value={form.phone}
                  type="tel"
                  maxLength={16}
                  onChange={e => setForm({ ...form, phone: formatPhone(e.target.value) })}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button onClick={resetForm}
                  className="flex-1 nav-glass rounded-xl py-3 text-sm font-medium transition-colors hover:bg-[var(--nav-surface-glass)]"
                  style={{ color: 'var(--nav-text-secondary)' }}>
                  Отмена
                </button>
                <button onClick={saveClient} disabled={saving}
                  className="flex-1 rounded-xl py-3 text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
                  style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                  {saving ? 'Сохраняем...' : editingId ? 'Сохранить' : 'Добавить'}
                </button>
              </div>
            </motion.div>
          )}

          {loading ? (
            <div className="nav-glass rounded-2xl overflow-hidden mb-4">
              {[0, 1, 2].map(i => (
                <div key={i} className="flex items-center px-4 py-3.5" style={{ borderBottom: i < 2 ? '1px solid var(--nav-border-soft)' : 'none' }}>
                  <div className="flex-1">
                    <Skeleton className="h-4 w-32 mb-2" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center text-center py-12">
              <PeopleIcon />
              <p className="text-sm mt-3" style={{ color: 'var(--nav-text-secondary)' }}>
                {search ? 'Клиент не найден' : 'Нет клиентов'}
              </p>
              {search && (
                <button onClick={() => setSearch('')}
                  className="mt-3 text-xs font-medium" style={{ color: 'var(--nav-accent)' }}>
                  Очистить поиск
                </button>
              )}
            </div>
          ) : (
            <div className="nav-glass rounded-2xl overflow-hidden mb-4">
              {filtered.map((client, i) => (
                <motion.div key={client.id}
                  initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: reduceMotion ? 0 : Math.min(i * 0.035, 0.4), duration: reduceMotion ? 0 : 0.35, ease: EASE }}
                  className="flex items-center px-4 py-3.5 transition-colors hover:bg-[var(--nav-surface-glass)]"
                  style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--nav-border-soft)' : 'none' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate" style={{ color: 'var(--nav-text-primary)' }}>{client.name}</div>
                    {client.bin_iin && <div className="text-xs mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>БИН: {client.bin_iin}</div>}
                    {client.email && <div className="text-xs truncate" style={{ color: 'var(--nav-text-muted)' }}>{client.email}</div>}
                    {client.phone && <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{client.phone}</div>}
                    {client.address && <div className="text-xs truncate" style={{ color: 'var(--nav-text-muted)' }}>{client.address}</div>}
                  </div>
                  <div className="flex items-center gap-1 ml-3 flex-shrink-0">
                    <button onClick={() => startEdit(client)} aria-label="Изменить"
                      className="w-11 h-11 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--nav-surface-glass)]"
                      style={{ color: 'var(--nav-text-muted)' }}>
                      <PencilIcon />
                    </button>
                    <button onClick={() => deleteClient(client.id)} aria-label="Удалить"
                      className="w-11 h-11 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--nav-surface-glass)] hover:text-[color:var(--nav-critical)]"
                      style={{ color: 'var(--nav-text-muted)' }}>
                      <XIcon />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {!showForm && clients.length > 0 && (
            <motion.button
              onClick={() => setShowForm(true)}
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.2 }}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl py-3.5 text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0"
              style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)', boxShadow: '0 10px 24px -10px var(--nav-accent)' }}
            >
              <PlusIcon />
              Новый клиент
            </motion.button>
          )}
        </div>
      </main>
    </DesktopShell>
  )
}
