// kk: вычитка носителем ждёт основателя
import BikBankPage from '../../BikBankPage'
import { bankMetadata } from '../../bikMeta'

export const metadata = bankMetadata('kmf-bank', 'kk')

export default function Page() {
  return <BikBankPage slug="kmf-bank" lang="kk" />
}
