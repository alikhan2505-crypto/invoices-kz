import BikBankPage from '../BikBankPage'
import { bankMetadata } from '../bikMeta'

export const metadata = bankMetadata('vtb-kazakhstan', 'ru')

export default function Page() {
  return <BikBankPage slug="vtb-kazakhstan" lang="ru" />
}
