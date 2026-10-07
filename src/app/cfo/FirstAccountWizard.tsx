'use client'
import { saveAccount } from '@/lib/cfo/data'
import { useCfo } from './CfoWorkspace'
import AccountForm from './AccountForm'
import { Card, CfoPage } from './ui'

export default function FirstAccountWizard() {
  const { ws, reload } = useCfo()
  return (
    <CfoPage title="Начнём учёт">
      <Card className="max-w-xl">
        <p className="text-sm mb-4" style={{ color: 'var(--nav-text-secondary)' }}>
          Добавьте счёт или кассу, с которых начинаете учёт. Остаток на дату — стартовая точка для движения денег и платёжного календаря.
          Остальные счета можно добавить потом в настройках.
        </p>
        <AccountForm
          operations={ws.operations}
          submitLabel="Начать учёт"
          onSave={async (a) => {
            try {
              await saveAccount(ws, a)
              await reload()
              return null
            } catch (e) {
              return e instanceof Error ? e.message : String(e)
            }
          }}
        />
      </Card>
    </CfoPage>
  )
}
