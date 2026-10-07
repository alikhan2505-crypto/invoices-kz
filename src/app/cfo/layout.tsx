import ProductShell from '@/components/ProductShell'
import CfoWorkspace from './CfoWorkspace'

export default function CfoLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProductShell product="cfo">
      <CfoWorkspace>{children}</CfoWorkspace>
    </ProductShell>
  )
}
