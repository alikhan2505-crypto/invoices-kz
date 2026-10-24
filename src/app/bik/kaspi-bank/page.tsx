import BikBankPage from '../BikBankPage'
import { bankMetadata } from '../bikMeta'

export const metadata = bankMetadata('kaspi-bank', 'ru')

export default function Page() {
  return <BikBankPage slug="kaspi-bank" lang="ru" />
}
