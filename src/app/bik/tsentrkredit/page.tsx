import BikBankPage from '../BikBankPage'
import { bankMetadata } from '../bikMeta'

export const metadata = bankMetadata('tsentrkredit', 'ru')

export default function Page() {
  return <BikBankPage slug="tsentrkredit" lang="ru" />
}
