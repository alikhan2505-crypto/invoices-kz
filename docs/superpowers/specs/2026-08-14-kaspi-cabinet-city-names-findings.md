# Kaspi cabinet city-name lookup — live findings (2026-08-14)

Confirmed live against the real connected ABIL-SISTERS session (via a temporary diagnostic route, `mc.shop.kaspi.kz/mc/facade/graphql`, same authenticated GraphQL facade `getMerchantInfo`/`listCatalog` already use in `cabinetApi.ts`).

## Confirmed: `cities` query field

```graphql
query getCities {
  cities {
    id
    name
  }
}
```

- **Endpoint:** `POST https://mc.shop.kaspi.kz/mc/facade/graphql` (optionally `?opName=getCities`, not required)
- **Auth:** requires the connection's `session_cookies` — same `authHeaders(sessionCookies)` helper already used by `getMerchantInfo`/`listCatalog` in `cabinetApi.ts` (`x-auth-version: 3`, `cookie: sessionCookies`, `origin`/`referer: kaspi.kz`).
- **Args:** none.
- **Return type:** `City!` — `{ id: String!, name: String }`, as a non-null list of non-null `City`.
- **Real sample** (captured live, truncated): `{"id":"750000000","name":"Алматы"}`, `{"id":"710000000","name":"Астана"}` (id cut off in the capture but the `710000000` prefix matches Astana's known code), `{"id":"151010000","name":"Актобе"}`, `{"id":"471010000","name":"Актау"}`, plus 200+ smaller towns/villages in the same response (full list not counted exactly, but clearly the complete national city/point list, not just major cities).
- `750000000` → `"Алматы"` matches the `CITY_ID` constant already hardcoded in `.github/scripts/kaspi-shop-price-check.mjs`, confirming this is the same id space used everywhere else in this codebase (`allCityPrices`, `kaspi_shop_product_city_prices.city_code`, the offer-view endpoint's `cityId`).

## Conclusion for Task 5

A real, authenticated, no-argument endpoint exists. Implement `fetchCityNames(sessionCookies, merchantId)` in `cabinetApi.ts` as:

```ts
export async function fetchCityNames(sessionCookies: string, _merchantId: string): Promise<Record<string, string>> {
  try {
    const res = await fetch('https://mc.shop.kaspi.kz/mc/facade/graphql?opName=getCities', {
      method: 'POST',
      headers: authHeaders(sessionCookies),
      body: JSON.stringify({
        operationName: 'getCities',
        variables: {},
        query: `query getCities { cities { id name } }`,
      }),
    })
    if (!res.ok) return {}
    const json = await res.json().catch(() => null)
    const cities = json?.data?.cities
    if (!Array.isArray(cities)) return {}
    const result: Record<string, string> = {}
    for (const c of cities) {
      if (c?.id && c?.name) result[String(c.id)] = String(c.name)
    }
    return result
  } catch {
    return {}
  }
}
```

(`merchantId` is accepted for signature consistency with this module's other functions but unused — `cities` takes no arguments and isn't merchant-scoped; kept as `_merchantId` rather than dropped, matching how the plan's Task 5 dispatch describes the function signature.)

Task 1's diagnostic route (`src/app/api/kaspi-shop/diag-graphql/route.ts`) is removed in the same commit as this findings doc.
