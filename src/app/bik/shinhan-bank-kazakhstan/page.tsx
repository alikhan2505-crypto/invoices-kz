import BikBankPage from '../BikBankPage'
import { bankMetadata } from '../bikMeta'

export const metadata = bankMetadata('shinhan-bank-kazakhstan', 'ru')

export default function Page() {
  return <BikBankPage slug="shinhan-bank-kazakhstan" lang="ru" />
}
