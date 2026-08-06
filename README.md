# Yuan Market — yuan.pk

Transparent B2B China sourcing marketplace for Pakistani wholesalers, dealers
and general stores. Operated by **Yuan.pk Pvt. Ltd.**, Multan, Punjab.

## What makes it different

Every price is shown as a full sheet, never a single figure: the Chinese
seller's own price, the live cross-checked PKR rate, and each landed cost
(freight, duty, sales tax, port, clearing, inland) on its own line — with a
flat 20% service fee stated openly at the bottom.

## Listing tiers

| Tier | Meaning |
|---|---|
| `verified` | Mirza Javaid Iqbal stood in the shop, saw the goods and wrote the price himself. |
| `indicative` | The supplier's own marketplace listing, captured automatically with source URL and date. Sourcing price is approximate until visited in person. |

Indicative listings are rendered with a dashed border and amber badge so a
buyer can never mistake one for a verified price.

## Accounts

- **buyer** — Pakistani wholesaler. Signs in with phone + a WhatsApp code.
- **seller** — Chinese supplier. Interface available in Chinese. **Cannot edit
  public prices**; submits a price-change request for review.
- **admin** — Mirza Javaid Iqbal. Full control, sees supplier contacts, sets
  the real cost figures that drive every calculation.

## Orders

No payment is taken upfront. Order placed → supplier enquiry → supplier
confirms → invoice issued → payment → sourcing → shipped → delivered.

## Stack

Static HTML + Netlify Functions (zero npm dependencies, node builtins and
`fetch` only) + Supabase Postgres. The service-role key lives only in the
function layer; row security is deny-by-default with `anon` and
`authenticated` revoked on every table.

## Build

Images travel as base64 text under `assets/enc/` because binaries cannot be
pushed reliably through the API integration. `scripts/build.mjs` decodes them
into `img/` and content-hashes the asset links at deploy time.

    node scripts/build.mjs

## Environment

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Service-role key — server-side only, never shipped to the browser |
| `MARKET_SESSION_SECRET` | HMAC secret for signed session cookies |
| `MARKET_ADMIN_PHONES` | Comma-separated phone numbers granted admin on first sign-in |
