import BikBankPage from '../BikBankPage'
import { bankMetadata } from '../bikMeta'

export const metadata = bankMetadata('evraziyskiy-bank', 'ru')

export default function Page() {
  return <BikBankPage slug="evraziyskiy-bank" lang="ru" />
}
