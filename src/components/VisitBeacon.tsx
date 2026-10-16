'use client'
import { useEffect } from 'react'
import { sendVisitBeacon } from '@/lib/visits/client'

// Счётчик заходов на публичные страницы (отчёт «Машина/QR» основателю).
// Ничего не рисует и не блокирует: бикон уходит, когда браузер свободен.
export default function VisitBeacon() {
  useEffect(() => { sendVisitBeacon() }, [])
  return null
}
