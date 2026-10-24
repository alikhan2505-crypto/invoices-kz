// kk: вычитка носителем ждёт основателя
import BikBankPage from '../../BikBankPage'
import { bankMetadata } from '../../bikMeta'

export const metadata = bankMetadata('tsentrkredit', 'kk')

export default function Page() {
  return <BikBankPage slug="tsentrkredit" lang="kk" />
}
