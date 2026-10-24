import BikBankPage from '../BikBankPage'
import { bankMetadata } from '../bikMeta'

export const metadata = bankMetadata('halyk-bank', 'ru')

export default function Page() {
  return <BikBankPage slug="halyk-bank" lang="ru" />
}
