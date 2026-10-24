import BikBankPage from '../BikBankPage'
import { bankMetadata } from '../bikMeta'

export const metadata = bankMetadata('bereke-bank', 'ru')

export default function Page() {
  return <BikBankPage slug="bereke-bank" lang="ru" />
}
