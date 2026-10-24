// kk: вычитка носителем ждёт основателя
import BikHubPage from '../BikHubPage'
import { hubMetadata } from '../bikMeta'

export const metadata = hubMetadata('kk')

export default function Page() {
  return <BikHubPage lang="kk" />
}
