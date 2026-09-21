import type { ProductKey } from '@/lib/products'

// Flat CSS/SVG "illustrations", one per product and drawn from its subject
// (DESIGN.md §7): sheets and a payment stamp for invoices, a parcel and a
// price tag for Kaspi, braces for the API, two dialogues for the agent, a
// calendar for the salon, berries for Wildberries. Decorative only.
const DISPLAY = { fontFamily: 'var(--font-unbounded), Arial, sans-serif', fontWeight: 700 } as const
const MONO = { fontFamily: 'var(--font-geist-mono), monospace', fontWeight: 500 } as const

export default function ProductArt({ product }: { product: ProductKey }) {
  const common = { viewBox: '0 0 240 210', 'aria-hidden': true, focusable: false } as const
  switch (product) {
    case 'invoices':
      return (
        <svg {...common}>
          <rect x="52" y="30" width="126" height="152" rx="16" fill="#6B77E8" transform="rotate(-9 115 106)" />
          <rect x="52" y="30" width="126" height="152" rx="16" fill="#A9B2FF" transform="rotate(-3 115 106)" />
          <g transform="rotate(4 115 106)">
            <rect x="52" y="30" width="126" height="152" rx="16" fill="#F4F6FF" />
            <rect x="72" y="56" width="60" height="9" rx="4.5" fill="#1C2056" />
            <rect x="72" y="78" width="86" height="7" rx="3.5" fill="#1C2056" opacity=".35" />
            <rect x="72" y="94" width="76" height="7" rx="3.5" fill="#1C2056" opacity=".35" />
            <rect x="72" y="110" width="52" height="7" rx="3.5" fill="#1C2056" opacity=".35" />
          </g>
          <circle cx="176" cy="156" r="34" fill="#2DC48D" />
          <path d="m160 157 12 12 22-25" fill="none" stroke="#0C2A1F" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'kaspiShop':
      return (
        <svg {...common}>
          <rect x="40" y="78" width="140" height="104" rx="18" fill="#2A0B07" />
          <rect x="96" y="78" width="28" height="104" fill="#FFD9D0" />
          <rect x="30" y="56" width="160" height="34" rx="14" fill="#4A1610" />
          <rect x="96" y="56" width="28" height="34" fill="#FFD9D0" />
          <g transform="rotate(11 188 46)">
            <rect x="150" y="22" width="80" height="40" rx="20" fill="#FFFFFF" />
            <text x="190" y="49" textAnchor="middle" fontSize="17" fill="#2A0B07" style={DISPLAY}>−8 %</text>
          </g>
          <path d="M204 84v34m0 0-11-11m11 11 11-11" fill="none" stroke="#2A0B07" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'kaspiApi':
      return (
        <svg {...common}>
          <text x="6" y="150" fontSize="170" fill="#14130A" style={MONO}>{'{'}</text>
          <text x="150" y="150" fontSize="170" fill="#14130A" style={MONO}>{'}'}</text>
          <g fill="#14130A">
            <rect x="88" y="62" width="20" height="20" rx="4" />
            <rect x="114" y="62" width="20" height="20" rx="4" opacity=".25" />
            <rect x="88" y="88" width="20" height="20" rx="4" opacity=".25" />
            <rect x="114" y="88" width="20" height="20" rx="4" />
            <rect x="88" y="114" width="20" height="20" rx="4" />
            <rect x="114" y="114" width="20" height="20" rx="4" opacity=".25" />
          </g>
        </svg>
      )
    case 'aiAgent':
      return (
        <svg {...common}>
          <path d="M58 36h96a30 30 0 0 1 30 30v22a30 30 0 0 1-30 30h-52l-30 24v-24h-14a30 30 0 0 1-30-30V66a30 30 0 0 1 30-30Z" fill="#FFFFFF" />
          <g fill="#1D1140"><circle cx="74" cy="77" r="8" /><circle cx="106" cy="77" r="8" /><circle cx="138" cy="77" r="8" /></g>
          <path d="M112 112h84a28 28 0 0 1 28 28v18a28 28 0 0 1-28 28h-8v22l-28-22h-48a28 28 0 0 1-28-28v-18a28 28 0 0 1 28-28Z" fill="#1D1140" />
          <g fill="#B7A6FF"><circle cx="118" cy="150" r="7" /><circle cx="144" cy="150" r="7" /><circle cx="170" cy="150" r="7" /></g>
        </svg>
      )
    case 'salon':
      return (
        <svg {...common}>
          <rect x="40" y="36" width="150" height="140" rx="24" fill="#3B1030" />
          <rect x="40" y="36" width="150" height="36" rx="24" fill="#5A1B4A" />
          <g fill="#F7C6D4">
            <circle cx="74" cy="100" r="9" opacity=".35" /><circle cx="106" cy="100" r="9" opacity=".35" />
            <circle cx="138" cy="100" r="9" opacity=".35" /><circle cx="170" cy="100" r="9" />
            <circle cx="74" cy="132" r="9" opacity=".35" /><circle cx="106" cy="132" r="9" />
            <circle cx="138" cy="132" r="9" opacity=".35" /><circle cx="170" cy="132" r="9" opacity=".35" />
          </g>
          <g transform="rotate(-8 190 176)">
            <rect x="140" y="152" width="82" height="38" rx="19" fill="#FFFFFF" />
            <text x="181" y="178" textAnchor="middle" fontSize="16" fill="#3B1030" style={DISPLAY}>15:00</text>
          </g>
        </svg>
      )
    case 'wildberries':
      return (
        <svg {...common}>
          <circle cx="70" cy="126" r="46" fill="#FF86D3" />
          <circle cx="142" cy="140" r="52" fill="#FBEAFB" />
          <circle cx="118" cy="70" r="40" fill="#B44ECB" />
          <circle cx="196" cy="84" r="30" fill="#FF86D3" />
          <ellipse cx="150" cy="30" rx="26" ry="11" fill="#FBEAFB" transform="rotate(-24 150 30)" />
        </svg>
      )
  }
}
