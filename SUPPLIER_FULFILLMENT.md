# Multi-supplier fulfillment (SupplierOrder model)

This platform lets one customer Order ship as more than one independently-tracked parcel —
one per supplier. It's the generalized version of an idea originally scoped in
`PLATFORM_UPGRADE_SPEC.md` for a different, never-built store; that doc no longer lives in this
repo since most of it (cosmetics compliance, one specific brand's suppliers) doesn't apply here.
This doc describes what was actually built.

## Why

Two very different kinds of supplier coexist in the same store:
- **API suppliers** (CJ Dropshipping, AliExpress) — orders submit automatically, tracking comes
  back via webhook or polling.
- **Manual suppliers** (Good Display today; anything else later) — no ordering API. The store
  owner places the order by hand and enters tracking once it ships.

A cart can mix both. `SupplierOrder` is the unit that makes that work: one row per supplier per
customer order, each with its own status and tracking, instead of the old flat
`Order.trackingNumber`/`Order.cjOrderId`-style fields that only supported one shipment per order.

## The model

- `SupplierKey`: `CJ | ALIEXPRESS | MANUAL | PRINTFUL | GELATO | BIGBUY | WOO_BRIDGE`.
  `MANUAL` is deliberately **not** one value per manual supplier — a `MANUAL` `SupplierOrder`
  carries a free-text `supplierName` (from the product's `vendor` field) instead. Onboarding a
  new manual supplier (a second frame maker, a print shop, anything) never needs a schema
  change — just set `vendor` on the product. The four keys after `MANUAL` are **configurable
  suppliers**, described in their own section below.
- `SupplierOrderStatus`: `AWAITING_MANUAL | SUBMITTED | SHIPPED | ERROR | CANCELLED`. Every
  `SupplierOrder` starts `AWAITING_MANUAL`; `MANUAL` parcels stay there until someone enters
  tracking. `CJ`/`ALIEXPRESS` parcels move to `SUBMITTED` once the order is placed with that
  supplier's API, then `SHIPPED` once tracking arrives (webhook, polling, or manual entry as a
  fallback).
- `Order.fulfillmentStatus`/`Order.status` are derived from the child `SupplierOrder`s
  (`recomputeOrderFulfillment` in `backend/src/services/supplierOrderFulfillment.ts`) —
  `UNFULFILLED` until the first parcel ships, `PARTIALLY_FULFILLED` while some but not all have
  shipped, `FULFILLED`/`SHIPPED` once every non-cancelled parcel has.

## How an order gets classified and split

`splitOrderIntoSupplierOrders` (called right after payment, and lazily by the admin
fulfill-cj/fulfill-aliexpress actions) groups an order's items by:
1. Item's variant has `cjVariantId` → `CJ`
2. Item's variant has `aliexpressSkuId`/`aliexpressSkuAttr` and its product has
   `aliexpressProductId` → `ALIEXPRESS`
3. Item's product has a `supplierKey` (one of the configurable suppliers), its variant has a
   `supplierVariantRef`, **and** the store has that supplier enabled in `StoreSupplier` →
   that key
4. Otherwise → `MANUAL`, named after `product.vendor` (falls back to "Manual fulfillment" if
   unset)

Rule 3 requires all three conditions on purpose. A product pointing at a supplier the store
has switched off falls through to `MANUAL` — a human fulfils it — rather than producing a
parcel that can never submit.

This is idempotent — safe to call again on an already-split order (returns the existing
parcels), which matters because it's invoked from a webhook that might redeliver.

## Onboarding a new supplier

**Another manual supplier** (no code): create products with `vendor` set to the new supplier's
name. Orders containing those items automatically get their own `MANUAL` parcel, grouped
separately from any other manual supplier already in use.

**A new API-backed supplier** (real work, but contained): implement the `SupplierAdapter`
interface in `backend/src/suppliers/` (see `CJAdapter.ts`/`AliExpressAdapter.ts` for the shape —
`placeOrder`/`getOrderStatus`/etc.), register it in `backend/src/suppliers/registry.ts`, add its
key to the `SupplierKey` enum, and extend `classifySupplier()` and `submitSupplierOrder()` in
`supplierOrderFulfillment.ts` to route to it. `MANUAL_*` products can then be migrated to the
new automated key by re-tagging the product's identifying field once the integration works —
"move to manual" is always the fallback if the API submission errors.

**A supplier with no API at all, but a WooCommerce store**: no code. Use the WooCommerce
bridge — see "Onboarding a no-API supplier" below.

## Configurable (per-store) suppliers

CJ and AliExpress were built when this was one business running one store, so they read their
credentials from process environment variables and are shared by every store on the
deployment. Every supplier added since is **per store**: different stores have their own
Printful/Gelato/BigBuy/WooCommerce accounts, so credentials live in the database on
`StoreSupplier`, not in env.

| | CJ / AliExpress | Printful / Gelato / BigBuy / WooBridge |
|---|---|---|
| Credentials | `process.env` | `StoreSupplier.settings` (JSON, per store) |
| Adapter | singleton via `getAdapter(name)` | constructed per call via `getConfigurableAdapter(key, settings)` |
| Product link | `cjVariantId` / `aliexpressSkuId` columns | `Product.supplierKey` + `ProductVariant.supplierVariantRef` |
| Enable/disable | always on if env is set | `StoreSupplier.enabled`, per store |

### The pieces

- `backend/src/suppliers/configurableTypes.ts` — shared plumbing: the key subset, settings
  helpers, `SupplierConfigError`, and `isSecretSettingKey()` (which drives credential masking).
- `backend/src/suppliers/configurableRegistry.ts` — **the single source of truth**: display
  name, description, capability flags, and the list of settings fields each supplier needs.
  The admin Integrations page, the settings PUT validation, and the Setup Assistant tools all
  render from this. Adding a supplier means: write the adapter, add an entry here, add the
  enum value. Nothing else hardcodes the list.
- `getConfigurableAdapter(key, settings)` in `registry.ts` — builds a configured adapter.
  Never cache the result across stores; the settings differ per store.

### The adapters

- **`PrintfulAdapter`** — print-on-demand. Stable v1 REST API (`https://api.printful.com`),
  `Authorization: Bearer <private token>`, plus `X-PF-Store-Id` for account-level tokens.
  Orders go to `POST /orders?confirm=1` — without `confirm` Printful parks the order as a
  draft a human has to approve, which would silently stall every order. Tracking comes from
  `GET /orders/{id}` → `shipments[0]`, or from the `package_shipped` webhook
  (`parseWebhookEvent`), delivered to `POST /api/webhooks/printful/:storeId`
  (`routes/webhooks/printful.ts`). Printful does not sign webhooks — the store id in the path is
  the only protection, so treat that URL as a secret. The admin Integrations page shows it
  (with a copy button) once Printful is expanded — paste it into Printful Dashboard → Settings →
  Webhooks. Market availability uses `POST /shipping/rates`.
- **`GelatoAdapter`** — print-on-demand with local production in 30+ countries. Split hosts:
  `order.gelatoapis.com/v4` and `product.gelatoapis.com/v3`, auth via `X-API-KEY`. A Gelato
  "product" is already a fully-specified variant (its `productUid` encodes size/paper/colour),
  so it maps to exactly one variant. **Incomplete**: Gelato needs a print-ready artwork file
  per item, and this platform has no print-asset model yet — see the `TODO(real-docs-needed)`
  in `placeOrder`. Orders for products that require a file will be rejected until that's built.
- **`BigBuyAdapter`** — European wholesale, ships from Spain. `Authorization: Bearer <key>`,
  `POST /rest/order/create.json`, tracking from `GET /rest/tracking/order/{id}.json`. BigBuy
  has **no keyword search endpoint** (its catalogue is meant to be bulk-downloaded and indexed
  by the integrator), so "search" is a SKU/reference lookup and the capability flag says so.
  `checkMarketAvailability` fails open with a `TODO(real-docs-needed)` — their shipping-coverage
  endpoint isn't in the public API description and wasn't worth inventing.
- **`WooBridgeAdapter`** — see below.

### Onboarding a no-API supplier (the WooCommerce bridge)

Most small suppliers have no ordering API. A large share of them do run a WooCommerce store,
and WooCommerce ships a complete REST API out of the box. `WooBridgeAdapter` treats any such
storefront as a supplier: we place a real order on their site and read status and tracking back
off it.

It is deliberately **generic** — no company name appears anywhere in the adapter. Onboarding
supplier #2, #3, #N is configuration, not code:

1. Ask the supplier to create a REST API key: their WooCommerce admin → Settings → Advanced →
   REST API → Add key, **Read/Write** permission. They give you a consumer key and secret.
2. In this store's Admin → Integrations → *Custom WooCommerce Bridge*, fill in the supplier's
   name, their store URL (HTTPS), and the key/secret. Save & enable.
3. On each product you source from them, set `Product.supplierKey = WOO_BRIDGE` and each
   variant's `supplierVariantRef` to that supplier's Woo product id. For a *variable* Woo
   product use `"productId:variationId"` — the adapter splits it back apart when ordering.
4. Optional, for push updates instead of polling: have them add an **Order updated** webhook
   (WooCommerce admin → Settings → Advanced → Webhooks) pointing at
   `POST /api/webhooks/woo/:storeId` (shown, with a copy button, on the admin Integrations page
   once this supplier is expanded — that's `routes/webhooks/woo.ts`), with a shared secret, and
   paste the same secret into the *Webhook secret* field here. WooCommerce signs deliveries as
   `X-WC-Webhook-Signature: base64(HMAC-SHA256(rawBody, secret))`; `verifyWebhookSignature()`
   checks it. **Pass the raw request body** — re-serialising parsed JSON changes byte order and
   the signature will never match.

Orders are created with `status: "processing"` and `set_paid: true`, which is the state a
supplier's pick-and-pack workflow reacts to (you settle with them out of band, on account). Our
own order number is attached as `_source_order_reference` meta so both sides can talk about the
same order.

One caveat: **core WooCommerce has no tracking field** — tracking always comes from a plugin,
and each plugin picks its own meta key. `extractTracking()` scans the order's `meta_data` for
the key names the common shipment-tracking plugins use. If a supplier's plugin isn't matched,
nothing breaks: the parcel simply stays awaiting-tracking and an operator pastes it in by hand,
exactly like a `MANUAL` parcel.

### Enabling a supplier

**Admin → Integrations**, in the "Your store's suppliers" section. Each card shows what the
supplier can do, which settings it needs, and whether it's configured and enabled. A supplier
cannot be enabled while a required setting is empty — enabling it would route real orders at an
adapter that throws on every submission.

Credentials are **write-mostly**. `GET /api/admin/store-suppliers` redacts any setting whose key
contains `key`/`secret`/`token`/`password` to a `••••1234` preview; sending that mask back on a
PUT means "unchanged", so an operator editing an unrelated field can't overwrite a real key with
dots. Settings keys the supplier doesn't declare are dropped rather than stored.

The Setup Assistant can do all of this conversationally: `list_available_suppliers`,
`get_supplier_capabilities`, `enable_supplier`.

## Automatic retry (API submission failures)

`submitSupplierOrder` no longer just fails and stops — on error it schedules its own retry:

- Backoff schedule: 1 minute, 5 minutes, 30 minutes, 2 hours, 12 hours (`RETRY_BACKOFF_MS` in
  `supplierOrderFulfillment.ts`). Each failure increments `SupplierOrder.attempts` and sets
  `nextRetryAt`.
- `backend/src/services/fulfillmentRetry.ts`'s `runFulfillmentRetry()` runs every minute
  (registered in `index.ts`) and resubmits any parcel with an ordering API (every key except
  `MANUAL`) whose `nextRetryAt` has passed and `attempts < 5`. A no-op query when nothing is
  due.
- After the 5th failed attempt, `nextRetryAt` is left `null` (so the job stops picking it up)
  and `sendFulfillmentFailureAlertEmail` fires once (guarded by `failureNotifiedAt`) to the
  store's `contactEmail`, linking to the Fulfillment Queue.
- A success at any point resets `attempts`/`nextRetryAt`/`lastError` to a clean slate.
- Manual retry (the admin "Retry" button, or the Setup Assistant's `fulfill_order_with_supplier`)
  goes through the same `submitSupplierOrder` function and follows the same rules — it's not a
  separate path.
- `MANUAL` parcels are never part of this — there's no API to retry against.

## Where this shows up

- **Admin** (`admin/src/pages/orders/OrderDetail.tsx`): one card per parcel — items, status,
  and the fitting action (Submit/Retry for CJ/AliExpress, Copy details + Enter tracking for
  manual or as a universal fallback).
- **Admin Fulfillment Queue** (`admin/src/pages/fulfillment/FulfillmentQueue.tsx`, nav item
  with a badge count): a single cross-order table of every parcel currently `AWAITING_MANUAL`
  or `ERROR`, oldest first — the operational "what needs my attention right now" view, since
  the per-order cards only help once you already know which order to open. Backed by
  `backend/src/routes/admin/fulfillmentQueue.ts` (`GET /`, `GET /count` for the nav badge,
  `POST /:id/retry`, `PATCH /:id/fulfill`).
- **Storefront** `/track-order`: one status block per parcel once the split has run.
- **Checkout**: a "may ship in more than one parcel" note when `previewParcelCount()` (same
  classification rule, run against the cart before payment) returns more than 1.
- **Emails**: `sendShippingEmail` is per-parcel now — one email per shipment, not per order.
  `sendFulfillmentFailureAlertEmail` notifies the store owner when a parcel exhausts retries.
- **Setup Assistant**: `list_pending_fulfillments` and `get_fulfillment_details` read the same
  queue; `fulfill_order` (manual tracking) and `fulfill_order_with_supplier` (CJ/AliExpress,
  staged for confirmation) act on it. `list_available_suppliers`,
  `get_supplier_capabilities` and `enable_supplier` manage the per-store integrations.
- **Admin Integrations** (`admin/src/pages/integrations/StoreSuppliers.tsx`): one card per
  configurable supplier, rendered from the backend registry.
