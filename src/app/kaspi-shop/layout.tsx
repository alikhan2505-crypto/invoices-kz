import ProductShell from '@/components/ProductShell'

export default function KaspiShopLayout({ children }: { children: React.ReactNode }) {
  return <ProductShell product="kaspiShop">{children}</ProductShell>
}
