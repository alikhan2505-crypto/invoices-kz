// kk: вычитка носителем ждёт основателя
import BikBankPage from '../../BikBankPage'
import { bankMetadata } from '../../bikMeta'

export const metadata = bankMetadata('alatau-city-bank', 'kk')

export default function Page() {
  return <BikBankPage slug="alatau-city-bank" lang="kk" />
}
