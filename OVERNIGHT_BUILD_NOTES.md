# Overnight build — supplier platform expansion + compliance profiles

**Branch:** `feature/supplier-platform-expansion` (pushed to `origin`, not merged, no PR opened)
**Date:** 2026-08-03
**Scope:** additive only. No existing CJ / AliExpress / MANUAL code path was changed in
behaviour; no database was contacted; nothing was deployed.

---

## What was built

### Schema + migration
- [x] `SupplierKey` extended with `PRINTFUL`, `GELATO`, `BIGBUY`, `WOO_BRIDGE`. `CJ`,
      `ALIEXPRESS`, `MANUAL` untouched.
- [x] New `StoreSupplier` model — per-store enable flag + credentials JSON, unique on
      `(storeId, supplierKey)`. `Store.suppliers` relation added.
- [x] `Product.supplierKey`, `ProductVariant.supplierVariantRef` — generic supplier refs for
      the new suppliers only. `cjVariantId` / `aliexpressSkuId` / `aliexpressSkuAttr` /
      `aliexpressProductId` left exactly as they were.
- [x] `ComplianceProfile` enum; `Category.complianceProfile` (default `NONE`),
      `Product.complianceProfile` (nullable override), `Product.complianceData` (JSON).
- [x] Migration `backend/prisma/migrations/20260803030000_supplier_platform_expansion/`
      generated **offline** with `prisma migrate diff --from-schema-datamodel ...
      --to-schema-datamodel ... --script`, the same way the baseline was made. No
      `DATABASE_URL` was read or used, no `migrate dev` / `migrate deploy` was run, and the
      migration has **not** been applied anywhere. `migration_lock.toml` already said
      `postgresql`; it was not touched.

### Adapters (`backend/src/suppliers/`)
- [x] `PrintfulAdapter` — v1 REST, Bearer token + optional `X-PF-Store-Id`,
      `POST /orders?confirm=1`, `GET /orders/{id}` for tracking, `POST /shipping/rates` for
      market availability, `package_shipped` webhook parsing.
- [x] `GelatoAdapter` — `order.gelatoapis.com/v4` + `product.gelatoapis.com/v3`, `X-API-KEY`.
- [x] `BigBuyAdapter` — `POST /rest/order/create.json`, `GET /rest/tracking/order/{id}.json`.
- [x] `WooBridgeAdapter` — fully generic `wc/v3` bridge, Basic auth, `X-WC-Webhook-Signature`
      HMAC verification (timing-safe), plugin-agnostic tracking extraction.
- [x] `configurableTypes.ts` (shared plumbing) and `configurableRegistry.ts` (single source of
      truth for display names, capabilities and settings fields).
- [x] `getConfigurableAdapter(key, config)` added to `registry.ts`; `getAdapter` /
      `createAdapter` / `getDefaultAdapter` unchanged.

### Fulfillment wiring
- [x] `classifySupplier()` gained a fourth rule (product `supplierKey` + variant
      `supplierVariantRef` + supplier enabled for the store). CJ and AliExpress still match
      first, on identical conditions.
- [x] `submitSupplierOrder()` branches to `getConfigurableAdapter(...)` with the store's
      settings for the new keys, and refuses with a clear message if the supplier is disabled.
- [x] `supplierLabel()` helper replaces the hardcoded `'CJ' ? ... : 'AliExpress'` ternaries in
      timeline and error messages.
- [x] `runFulfillmentRetry()` now covers the new keys (`MANUAL` still excluded).
- [x] `previewParcelCount()` takes an optional `storeId`; checkout passes `req.storeId`.

### Compliance
- [x] `backend/src/lib/complianceProfiles.ts` — registry + resolution + missing-field detection.
- [x] Publish gate on create / update / status-PATCH → 400 `COMPLIANCE_INCOMPLETE`.
- [x] Store Health `product_compliance_complete` critical check.
- [x] Category API accepts `complianceProfile`.
- [x] `GET /api/admin/compliance-profiles` so the admin UI reads the registry.
- [x] Admin product editor: dynamic Compliance card. Admin category editor: profile picker.
- [x] Storefront product page: generic disclosure block, `data-theme-section` hook.

### Per-store supplier UI + assistant
- [x] `GET/PUT /api/admin/store-suppliers` with secret redaction.
- [x] `admin/src/pages/integrations/StoreSuppliers.tsx`, rendered from the Integrations page.
- [x] Setup Assistant tools: `list_available_suppliers`, `get_supplier_capabilities`,
      `enable_supplier`, `get_compliance_requirements`, plus two prompt guidelines.

### Docs
- [x] `SUPPLIER_FULFILLMENT.md` extended (new section on configurable suppliers + a
      step-by-step no-API supplier onboarding guide via the Woo bridge).
- [x] `COMPLIANCE_PROFILES.md` created.

---

## Judgment calls, and why

**1. The real `SupplierAdapter` interface differs from the brief.** The task described
`key`/`capabilities`/`submitOrder`/`fetchStatus`/`handleWebhook`. The interface actually in
`types.ts` is `name` / `searchProducts` / `getProduct` / `placeOrder` / `getOrderStatus` /
`checkMarketAvailability`, all required. I followed the real interface, since the brief said to
check its current shape and match it. Webhook handling isn't part of the interface, so
`parseWebhookEvent` / `verifyWebhookSignature` are extra public methods on the adapters that
need them — the same way `CJAdapter` carries `sandboxSimulatePay`. Capability metadata moved to
`configurableRegistry.ts` rather than onto the interface, so it can also describe things an
adapter can't do.

**2. No webhook *routes* were mounted for the new suppliers.** The adapters can parse and
verify webhook payloads, but I did not add `POST /api/webhooks/printful` or
`/api/webhooks/woo/:storeId` endpoints. Wiring a public unauthenticated endpoint that mutates
order state, with no credentials to test it against and nobody awake to review it, is the one
place tonight where "bias to action" was the wrong call. Tracking still arrives by polling for
all four. The parsing helpers are ready for whoever adds the routes.

**3. A product pointing at a *disabled* supplier falls through to `MANUAL`.** The alternative —
classifying it to the supplier anyway and letting submission fail — produces a parcel that can
never succeed. Falling back to manual means a human ships it. Same reasoning for
`submitSupplierOrder` refusing loudly when the `StoreSupplier` row is missing or disabled.

**4. Compliance lives in the `content_completeness` Store Health category, not a new one.**
Adding a sixth weighted category would have silently re-weighted every existing store's score
overnight. Compliance is "required content that's missing", so it fits, and the check is
`critical` — which is what actually produces the 59 cap.

**5. An explicit `NONE` on a product overrides its category's profile.** `null` means inherit;
`NONE` means "deliberately exempt". Without the distinction there'd be no way to exempt one
product from its category's profile.

**6. Compliance fields are validated for presence only, on a JSON column.** Typed columns per
profile would not survive a platform that hosts a cosmetics store and an electronics store on
one schema. Documented in `COMPLIANCE_PROFILES.md`.

**7. `Store Health` / publish gate split.** The API gate stops a product *becoming* ACTIVE;
it can't catch a product that went ACTIVE before a profile was assigned to its category. Hence
the audit check. Both share the same registry functions, so they can't drift.

**8. Masked secrets round-trip as "unchanged".** `GET` returns `••••1234`; a `PUT` carrying a
value starting with `••••` for a secret-shaped key is ignored rather than stored. Without this,
an operator editing an unrelated field would overwrite a live API key with dots. Unknown
settings keys are dropped rather than persisted.

**9. BigBuy's order email is the *store's* address, not the customer's.** BigBuy requires an
email on the shipping address, and `SupplierOrderRequest` carries a postal address only. A
fabricated address would send BigBuy's delivery-problem notices into a black hole, so it's a
required `notificationEmail` setting on the integration instead.

**10. No automated tests.** `backend/package.json` has no test framework, runner or script, and
no test files exist anywhere in the repo. Introducing Jest/Vitest at 3am, unreviewed, was out
of scope. Verification is `tsc --noEmit` (adapters structurally satisfy `SupplierAdapter`, and
the `getConfigurableAdapter` switch has an exhaustiveness guard that turns a missing case into a
compile error). Adapter contract tests with mocked HTTP are the obvious follow-up.

**11. The Postgres enum caveat.** The generated migration runs four
`ALTER TYPE "SupplierKey" ADD VALUE`s. Postgres forbids *using* a new enum value in the same
transaction that adds it — this migration only references the type, never the new values, so
it's fine as written. Worth a glance before applying, nothing more.

---

## What each new adapter needs to actually go live

None of these are configured — no credentials exist for any of them, and nothing was signed up
for. All are set per store in **Admin → Integrations → Your store's suppliers**.

| Supplier | Needed | Where to get it |
|---|---|---|
| **Printful** | `apiToken` (required), `storeId` (only for account-level tokens) | Printful Dashboard → Settings → Developers → create a private token |
| **Gelato** | `apiKey` (required), `catalogUid` (optional, defaults `posters`) | Gelato Dashboard → Developer → API keys |
| **BigBuy** | `apiKey` (required), `notificationEmail` (required), optional `paymentMethod` / `carriers` / `isoCode` / `sandbox` | API key is granted on request via BigBuy's API access form; a funded BigBuy account is needed for `moneybox` payment |
| **WooCommerce Bridge** | `supplierName`, `baseUrl` (HTTPS), `consumerKey`, `consumerSecret`, optional `webhookSecret` | The *supplier's* WooCommerce admin → Settings → Advanced → REST API → Add key, **Read/Write** |

Products must also be tagged: `Product.supplierKey` set to the supplier, and each variant's
`supplierVariantRef` set to that supplier's variant id (for a variable WooCommerce product,
`"productId:variationId"`).

---

## Explicit follow-ups

> **Status update, 2026-08-04:** items 1, 4, and 7 below are done — see `CLAUDE.md`'s "Where
> things stand" section for what changed and why. Left as originally written below for the
> historical record of what this overnight session did and didn't finish; don't trust this list
> over `CLAUDE.md` for current status.

1. **Gelato print files.** `GelatoAdapter.placeOrder` has a `TODO(real-docs-needed)`: Gelato
   needs a `files: [{ type, url }]` array per item, and this platform has no print-asset model
   (products carry photos, not print-ready artwork). Orders for products that require a file
   will be rejected until a print-asset field exists on `ProductVariant`. **Gelato is not
   usable end-to-end without this.**
2. **Gelato tracking field path.** The published Order schema documents `fulfillmentStatus` but
   not where the carrier tracking code lands. `getOrderStatus` reads both plausible locations
   defensively rather than guessing one. Confirm against a real order.
3. **BigBuy shipping coverage.** `checkMarketAvailability` fails open with a
   `TODO(real-docs-needed)` — their coverage endpoint isn't in the public API description.
4. **Webhook routes** for Printful (`package_shipped`) and the Woo bridge (`order.updated`) —
   see judgment call #2. Note Printful does not sign webhooks; protect the callback URL by
   making it unguessable.
5. **i18n of compliance field labels.** The storefront section heading is translated into all
   five locales; the individual field labels are English, served from the backend registry.
6. **Adapter contract tests** with mocked HTTP, once a test framework exists.
7. **Product import UI for the new suppliers.** The adapters implement `searchProducts` /
   `getProduct`, but the admin Import Products page still only offers CJ and AliExpress. Tagging
   a product to a new supplier is currently a manual field edit.
8. **BigBuy has no keyword search** (its `search` capability flag is `false` for that reason) —
   lookup is by SKU. If catalogue browsing matters, it needs a bulk catalogue download + local
   index.
9. **The migration is unapplied.** It needs `prisma migrate deploy` against the real database by
   a human, at a time of their choosing.

---

## Process compliance

- Started from a clean tree on `main`, branched immediately, never committed to `main`.
- Never ran `railway`, `vercel`, or any deploy/publish command.
- Never modified `backend/.env`; no command in this session connected to a database. The only
  Prisma commands used were `migrate diff` (pure file-to-file, offline) and `generate` (codegen,
  no connection).
- 8 commits, roughly one per milestone, each typechecking.
- `feature/supplier-platform-expansion` pushed to `origin`. No PR, no merge.

---

`npx tsc --noEmit` — **backend: PASS · admin: PASS · storefront: PASS**
