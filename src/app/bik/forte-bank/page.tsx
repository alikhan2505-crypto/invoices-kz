import BikBankPage from '../BikBankPage'
import { bankMetadata } from '../bikMeta'

export const metadata = bankMetadata('forte-bank', 'ru')

export default function Page() {
  return <BikBankPage slug="forte-bank" lang="ru" />
}
