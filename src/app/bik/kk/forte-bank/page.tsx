// kk: вычитка носителем ждёт основателя
import BikBankPage from '../../BikBankPage'
import { bankMetadata } from '../../bikMeta'

export const metadata = bankMetadata('forte-bank', 'kk')

export default function Page() {
  return <BikBankPage slug="forte-bank" lang="kk" />
}
