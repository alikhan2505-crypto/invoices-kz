// kk: вычитка носителем ждёт основателя
import BikBankPage from '../../BikBankPage'
import { bankMetadata } from '../../bikMeta'

export const metadata = bankMetadata('freedom-bank', 'kk')

export default function Page() {
  return <BikBankPage slug="freedom-bank" lang="kk" />
}
