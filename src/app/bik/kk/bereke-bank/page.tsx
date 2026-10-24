// kk: вычитка носителем ждёт основателя
import BikBankPage from '../../BikBankPage'
import { bankMetadata } from '../../bikMeta'

export const metadata = bankMetadata('bereke-bank', 'kk')

export default function Page() {
  return <BikBankPage slug="bereke-bank" lang="kk" />
}
