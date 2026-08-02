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

- `SupplierKey`: `CJ | ALIEXPRESS | MANUAL`. Deliberately **not** one value per manual
  supplier — a `MANUAL` `SupplierOrder` carries a free-text `supplierName` (from the product's
  `vendor` field) instead. Onboarding a new manual supplier (a second frame maker, a print shop,
  anything) never needs a schema change — just set `vendor` on the product.
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
3. Otherwise → `MANUAL`, named after `product.vendor` (falls back to "Manual fulfillment" if
   unset)

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

## Automatic retry (CJ/AliExpress submission failures)

`submitSupplierOrder` no longer just fails and stops — on error it schedules its own retry:

- Backoff schedule: 1 minute, 5 minutes, 30 minutes, 2 hours, 12 hours (`RETRY_BACKOFF_MS` in
  `supplierOrderFulfillment.ts`). Each failure increments `SupplierOrder.attempts` and sets
  `nextRetryAt`.
- `backend/src/services/fulfillmentRetry.ts`'s `runFulfillmentRetry()` runs every minute
  (registered in `index.ts`) and resubmits any CJ/ALIEXPRESS parcel whose `nextRetryAt` has
  passed and `attempts < 5`. A no-op query when nothing is due.
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
  staged for confirmation) act on it.
