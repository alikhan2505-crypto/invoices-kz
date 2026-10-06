import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // /print's server side reads the curated keychain fonts straight off disk
  // from public/ at runtime -- public/fonts/print-shop/<id>.ttf -- in
  // /api/print/orders (glyph + geometry pre-check) and inside
  // src/lib/printShop/orderFulfillment.ts (STL generation), which runs from
  // /api/print/orders/[id]/payment and the Kaspi poll cron.
  //
  // Next's file tracing has to notice 20 binary files reached through a
  // path.join(process.cwd(), ...) it cannot statically resolve. The same
  // pattern does work in production today for
  // /api/salon-sites/demo/[patternId], so this is belt-and-braces rather
  // than a known breakage -- but a missing .ttf here means a paid order
  // whose STLs can never be built, so the cheap insurance is worth it.
  //
  // Keys are route globs (picomatch against the route path); values are
  // globs resolved from the project root. Verified against this version's
  // bundled docs: node_modules/next/dist/docs/01-app/03-api-reference/
  // 05-config/01-next-config-js/output.md (Next 16.3.5). Bracketed dynamic
  // segments would need escaping in a key, so '/api/print/orders/**' covers
  // the [id] route without spelling it out.
  outputFileTracingIncludes: {
    '/api/print/orders': ['public/fonts/print-shop/**/*.ttf'],
    '/api/print/orders/**': ['public/fonts/print-shop/**/*.ttf'],
    '/api/cron/kaspi-poll': ['public/fonts/print-shop/**/*.ttf'],
  },
};

export default nextConfig;
