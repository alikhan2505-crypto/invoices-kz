import BikHubPage from './BikHubPage'
import { hubMetadata } from './bikMeta'

// Launch flag: while SEO_TARIFF_BIK_LIVE is false, hubMetadata() sets robots noindex
// (see bikMeta.ts). The sitemap and the guides hub do not link here until the flag flips.
export const metadata = hubMetadata('ru')

export default function Page() {
  return <BikHubPage lang="ru" />
}
