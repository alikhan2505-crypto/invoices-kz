import BikBankPage from '../BikBankPage'
import { bankMetadata } from '../bikMeta'

export const metadata = bankMetadata('freedom-bank', 'ru')

export default function Page() {
  return <BikBankPage slug="freedom-bank" lang="ru" />
}
