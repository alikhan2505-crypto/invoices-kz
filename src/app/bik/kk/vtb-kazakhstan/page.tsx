// kk: вычитка носителем ждёт основателя
import BikBankPage from '../../BikBankPage'
import { bankMetadata } from '../../bikMeta'

export const metadata = bankMetadata('vtb-kazakhstan', 'kk')

export default function Page() {
  return <BikBankPage slug="vtb-kazakhstan" lang="kk" />
}
