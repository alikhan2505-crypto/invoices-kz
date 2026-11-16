import StorefrontClosedGate from '@/components/kaspiShop/StorefrontClosedGate'

// Витрина закрыта до доработки: обычному человеку здесь «Скоро», админу рабочая страница (D4, 16.11.2026).
export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return <StorefrontClosedGate title={{ ru: 'Витрина', kk: 'Витрина', en: 'Storefront' }}>{children}</StorefrontClosedGate>
}
