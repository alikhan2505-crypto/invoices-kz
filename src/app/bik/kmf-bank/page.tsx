import BikBankPage from '../BikBankPage'
import { bankMetadata } from '../bikMeta'

export const metadata = bankMetadata('kmf-bank', 'ru')

export default function Page() {
  return <BikBankPage slug="kmf-bank" lang="ru" />
}
