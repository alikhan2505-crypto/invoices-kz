// kk: вычитка носителем ждёт основателя
import BikBankPage from '../../BikBankPage'
import { bankMetadata } from '../../bikMeta'

export const metadata = bankMetadata('shinhan-bank-kazakhstan', 'kk')

export default function Page() {
  return <BikBankPage slug="shinhan-bank-kazakhstan" lang="kk" />
}
