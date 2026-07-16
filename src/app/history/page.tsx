'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import AppNav from '@/components/AppNav'
import DesktopShell from '@/components/DesktopShell'
import * as XLSX from 'xlsx'
import { formatDateTime, formatDate } from '@/lib/date'
import { useLanguage } from '@/components/LanguageProvider'
import { historyDict } from '@/lib/i18n/history'

const statusColor: Record<string, string> = {
  paid: 'bg-green-100 text-green-700',
  sent: 'bg-blue-100 text-blue-700',
  overdue: 'bg-red-100 text-red-700',
  draft: 'bg-gray-100 text-gray-600',
  viewed: 'bg-purple-100 text-purple-700',
  cancelled: 'bg-gray-100 text-gray-500',
}

export default function History() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = historyDict[lang]
  const statusLabel: Record<string, { text: string; color: string }> = {
    paid: { text: t.statusLabels.paid, color: statusColor.paid },
    sent: { text: t.statusLabels.sent, color: statusColor.sent },
    overdue: { text: t.statusLabels.overdue, color: statusColor.overdue },
    draft: { text: t.statusLabels.draft, color: statusColor.draft },
    viewed: { text: t.statusLabels.viewed, color: statusColor.viewed },
    cancelled: { text: t.statusLabels.cancelled, color: statusColor.cancelled },
  }
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('all_time')

  useEffect(() => { loadInvoices() }, [])

  async function loadInvoices() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data } = await supabase
      .from('invoices')
      .select('*, clients(name)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setInvoices(data || [])
    setLoading(false)
  }

  async function deleteInvoice(e: React.MouseEvent, id: string, number: string) {
    e.stopPropagation()
    if (!confirm(t.confirmCancelInvoice(number))) return
    const { error } = await supabase.from('invoices').update({ status: 'cancelled' }).eq('id', id)
    if (error) { alert(t.errorPrefix(error.message)); return }
    await supabase.from('invoice_logs').insert({ invoice_id: id, status: 'cancelled' })
    setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, status: 'cancelled' } : inv))
  }

  async function markOverdue() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const { data, error } = await supabase
      .from('invoices')
      .update({ status: 'overdue' })
      .eq('user_id', user.id)
      .in('status', ['sent', 'viewed'])
      .lt('created_at', sevenDaysAgo.toISOString())
      .select()
    if (error) { alert(t.errorPrefix(error.message)); return }
    if (data && data.length > 0) {
      alert(t.markedOverdueMessage(data.length))
      loadInvoices()
    } else {
      alert(t.noOverdueInvoicesAlert)
    }
  }

  function exportToExcel() {
    const data = filtered.map(inv => ({
      [t.excelColumnNumber]: inv.number,
      [t.excelColumnClient]: inv.client_name || t.noClientLabel,
      [t.excelColumnBinIin]: inv.client_bin || '',
      [t.excelColumnAmount]: Number(inv.amount),
      [t.excelColumnStatus]: (statusLabel[inv.status] || statusLabel.draft).text,
      [t.excelColumnNote]: inv.note || '',
      [t.excelColumnDate]: formatDate(inv.created_at),
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, t.excelSheetName)
    ws['!cols'] = [
      { wch: 12 }, { wch: 30 }, { wch: 15 },
      { wch: 15 }, { wch: 12 }, { wch: 30 }, { wch: 15 },
    ]
    XLSX.writeFile(wb, t.excelFileName(formatDate(new Date().toISOString())))
  }

  const filtered = invoices.filter(inv => {
    const matchFilter = filter === 'all' || inv.status === filter
    const clientName = inv.client_name || inv.clients?.name || ''
    const matchSearch = clientName.toLowerCase().includes(search.toLowerCase()) ||
      inv.number.toLowerCase().includes(search.toLowerCase()) ||
      String(inv.amount).includes(search) ||
      (inv.note || '').toLowerCase().includes(search.toLowerCase())

    const invDate = new Date(inv.created_at)
    const now = new Date()
    let matchDate = true
    if (dateFilter === 'all_time') {
      matchDate = true
    } else if (dateFilter === 'today') {
      matchDate = invDate.toDateString() === now.toDateString()
    } else if (dateFilter === 'week') {
      const weekAgo = new Date(now)
      weekAgo.setDate(now.getDate() - 7)
      matchDate = invDate >= weekAgo
    } else if (dateFilter === 'month') {
      matchDate = invDate.getMonth() === now.getMonth() &&
        invDate.getFullYear() === now.getFullYear()
    } else if (dateFilter === 'last_month') {
      let lastMonth = now.getMonth() - 1
      let lastMonthYear = now.getFullYear()
      if (lastMonth < 0) { lastMonth = 11; lastMonthYear -= 1 }
      matchDate = invDate.getMonth() === lastMonth &&
        invDate.getFullYear() === lastMonthYear
    }

    return matchFilter && matchSearch && matchDate
  })

  const counts = {
    all: filtered.length,
    paid: filtered.filter(i => i.status === 'paid').length,
    sent: filtered.filter(i => i.status === 'sent').length,
    overdue: filtered.filter(i => i.status === 'overdue').length,
  }

  const totalAmount = filtered
    .filter(i => i.status === 'paid')
    .reduce((sum, i) => sum + Number(i.amount), 0)

  return (
    <DesktopShell>
    <main className="min-h-screen bg-gray-50 pb-24 lg:pl-20">
      <div className="sticky top-0 z-30 bg-white border-b px-4 py-3 flex items-center justify-between lg:h-16">
        <span className="font-bold text-[#1C2056]">INVOICES.KZ</span>
        <div className="flex gap-2">
          <button onClick={markOverdue}
            className="text-xs bg-red-50 text-red-500 border border-red-100 px-3 py-1.5 rounded-lg">
            {t.markOverdueButtonLabel}
          </button>
          <button onClick={exportToExcel}
            className="text-xs bg-[#1C2056] text-white px-3 py-1.5 rounded-lg">
            {t.exportButtonLabel}
          </button>
        </div>
      </div>

      <div className="max-w-lg lg:max-w-5xl mx-auto p-4">
        {/* Search */}
        <div className="bg-white rounded-xl px-3 py-2.5 flex items-center gap-2 shadow-sm mb-3">
          <span className="text-gray-400">🔍</span>
          <input
            className="flex-1 text-sm outline-none"
            placeholder={t.searchPlaceholder}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-gray-300 hover:text-gray-500">✕</button>
          )}
        </div>

        {/* Date filter */}
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
          {t.dateFilterOptions.map(d => (
            <button key={d.key}
              onClick={() => setDateFilter(d.key)}
              className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition flex-shrink-0 ${dateFilter === d.key ? 'bg-[#2DC48D] text-white' : 'bg-white text-gray-500 shadow-sm'}`}>
              {d.label}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {t.statusFilterOptions.map(f => (
            <button key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-4 py-1.5 rounded-full text-xs whitespace-nowrap transition flex-shrink-0 ${filter === f.key ? 'bg-[#1C2056] text-white' : 'bg-white text-gray-500 shadow-sm'}`}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[
            { label: t.statsAllLabel, value: counts.all },
            { label: t.statsPaidLabel, value: counts.paid },
            { label: t.statsUnpaidLabel, value: counts.sent },
            { label: t.statsOverdueLabel, value: counts.overdue, red: true },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl p-3 text-center shadow-sm">
              <div className={`text-lg font-semibold ${s.red && s.value > 0 ? 'text-red-500' : 'text-[#1C2056]'}`}>
                {s.value}
              </div>
              <div className="text-xs text-gray-400 mt-0.5 leading-tight">{s.label}</div>
            </div>
          ))}
        </div>

        {totalAmount > 0 && (
          <div className="bg-[#1C2056] rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
            <span className="text-white/70 text-sm">{t.incomeForPeriodLabel}</span>
            <span className="text-white font-bold">{totalAmount.toLocaleString('ru-KZ')} ₸</span>
          </div>
        )}

        {loading ? (
          <p className="text-center text-gray-400 py-8">{t.loadingLabel}</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">📄</div>
            <p className="text-gray-400 text-sm">{t.noInvoicesLabel}</p>
            <button onClick={() => router.push('/dashboard')}
              className="mt-4 bg-[#1C2056] text-white px-6 py-2.5 rounded-xl text-sm font-medium">
              {t.createFirstInvoiceButton}
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-4 lg:bg-transparent lg:shadow-none lg:rounded-none lg:overflow-visible lg:grid lg:grid-cols-2 lg:gap-3">
            {filtered.map((inv, i) => (
              <motion.div key={inv.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.4), duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className={`flex items-center p-4 hover:bg-gray-50 ${i < filtered.length - 1 ? 'border-b border-gray-100' : ''} lg:border-b-0 lg:rounded-xl lg:bg-white lg:shadow-sm lg:hover:shadow-md lg:hover:-translate-y-0.5 lg:transition-all`}>
                <div className="flex-1 flex items-start justify-between cursor-pointer"
                  onClick={() => router.push('/invoice/' + inv.id)}>
                  <div>
                    <div className="text-xs text-gray-400 mb-1">{inv.number}</div>
                    <div className="text-sm font-medium text-[#1C2056]">
                      {inv.client_name || inv.clients?.name || t.noClientLabel}
                    </div>
                    {inv.note && (
                      <div className="text-xs text-gray-400 mt-0.5 italic truncate max-w-[180px]">
                        {inv.note}
                      </div>
                    )}
                    <div className="text-xs text-gray-400 mt-1">
                      {formatDateTime(inv.created_at)}
                    </div>
                  </div>
                  <div className="text-right mr-3">
                    <div className="text-sm font-medium mb-1.5">
                      {Number(inv.amount).toLocaleString('ru-KZ')} ₸
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${(statusLabel[inv.status] || statusLabel.draft).color}`}>
                      {(statusLabel[inv.status] || statusLabel.draft).text}
                    </span>
                  </div>
                </div>
                <button
                  onClick={(e) => deleteInvoice(e, inv.id, inv.number)}
                  className="text-gray-300 hover:text-red-400 text-lg p-1 flex-shrink-0">
                  ✕
                </button>
              </motion.div>
            ))}
          </div>
        )}

        <button onClick={() => router.push('/dashboard')}
          className="w-full bg-[#1C2056] text-white rounded-xl py-4 font-medium text-sm">
          {t.createNewInvoiceButton}
        </button>
      </div>
      <AppNav />
    </main>
    </DesktopShell>
  )
}