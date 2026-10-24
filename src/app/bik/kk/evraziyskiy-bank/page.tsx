// kk: вычитка носителем ждёт основателя
import BikBankPage from '../../BikBankPage'
import { bankMetadata } from '../../bikMeta'

export const metadata = bankMetadata('evraziyskiy-bank', 'kk')

export default function Page() {
  return <BikBankPage slug="evraziyskiy-bank" lang="kk" />
}
