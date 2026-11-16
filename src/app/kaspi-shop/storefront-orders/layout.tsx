import StorefrontClosedGate from '@/components/kaspiShop/StorefrontClosedGate'

// Заказы витрины закрыты вместе с витриной: обычному человеку «Скоро», админу рабочая страница (D4, 16.11.2026).
export default function StorefrontOrdersLayout({ children }: { children: React.ReactNode }) {
  return <StorefrontClosedGate title={{ ru: 'Заказы витрины', kk: 'Витрина тапсырыстары', en: 'Storefront orders' }}>{children}</StorefrontClosedGate>
}
