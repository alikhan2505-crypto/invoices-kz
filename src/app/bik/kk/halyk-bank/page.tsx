// kk: вычитка носителем ждёт основателя
import BikBankPage from '../../BikBankPage'
import { bankMetadata } from '../../bikMeta'

export const metadata = bankMetadata('halyk-bank', 'kk')

export default function Page() {
  return <BikBankPage slug="halyk-bank" lang="kk" />
}
