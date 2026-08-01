// Kaspi's entrance API expects a bare digit string (`77071234567`), not the
// `+7 777 123 45 67` display format the /profile/kaspi-pay input produces.
// The page keeps its formatting for the human; this normalizes what actually
// goes over the wire.
export function normalizeKzPhone(input: string): string | null {
  const digits = String(input ?? '').replace(/\D/g, '')

  // Kazakh users routinely type the domestic 8-prefix ("8 707 …") — same
  // number, different national convention.
  const withCountryCode =
    digits.length === 11 && digits.startsWith('8') ? '7' + digits.slice(1)
    : digits.length === 10 ? '7' + digits
    : digits

  if (withCountryCode.length !== 11 || !withCountryCode.startsWith('7')) return null
  return withCountryCode
}
