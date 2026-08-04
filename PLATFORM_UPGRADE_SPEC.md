# PLATFORM UPGRADE SPECIFICATION — Multi-Supplier Fulfillment Engine + Skincare Launch
### Upgrading the existing CMS/e-commerce platform into a multi-brand, multi-supplier "personal brand" system. Skincare store ships first.

> **Who this document is for:** an AI coding agent (Claude Code in VS Code) working inside the owner's EXISTING repository.
> **Prerequisite reading:** `CMS_OVERVIEW.md` in the repo (the platform snapshot) and, for supplier/bridge background, `PROJECT_SPEC.md` if present. This document supersedes `PROJECT_SPEC.md`'s build plan — that spec described a from-scratch build; we are instead upgrading the live platform. Its §5 (Woo bridge order payloads), §7 (bridge runbook), and §9 (legal/compliance) remain valid reference material and are incorporated here by reference.
> **Golden rule:** this is a LIVE system with a working store pipeline (CJ + AliExpress). Every phase must leave the existing flows working. No big-bang rewrites. Migrations must be backwards-compatible at each step (expand → migrate data → contract).
> Anything marked `<<ASK OWNER>>` requires input from the owner before implementation. Do not invent credentials, external API shapes, or business rules.

---

## 0. Context: what exists and what we're building

**Existing platform (do not rebuild):** three services in one repo — `backend` (Node/Express/Prisma/Postgres on Railway), `admin` (React Vite SPA on Vercel), `storefront` (Next.js App Router on Vercel). Working features include: multi-store-capable data model (`Store`, `resolveStore` middleware), product catalog with CJ/AliExpress source IDs, Stripe checkout + webhooks, order management with `OrderTimeline`, i18n (en/fr/de/it/es), themes, AI Setup Assistant (tool-calling loop), Store Health auditor, Image Studio, blog, reviews, discounts, abandoned carts.

**What we're building, in one sentence:** a supplier-agnostic fulfillment engine (formal adapter interface + per-order supplier splitting + manual fulfillment queue + compliance profiles) so the platform can run multiple differently-sourced brand stores — with the owner's **skincare brand as the first launch**, fulfilled manually at first via Selfnamed and Nova Engel, then automated.

**Business context the agent needs:**
- **Selfnamed** (selfnamed.com): EU private-label cosmetics manufacturer. No public API. v1 fulfillment = owner manually re-enters orders in the Selfnamed dashboard (customer's address at their checkout, owner's saved card pays). v2 fulfillment = a hidden WooCommerce install ("the bridge") on a VPS with the Selfnamed plugin; our backend creates orders in it via the WooCommerce REST API (`POST /wp-json/wc/v3/orders`), the plugin syncs them to Selfnamed.
- **Nova Engel** (novaengel.com): Spanish branded-cosmetics wholesaler WITH an API. v1 = manual orders via their B2B portal; v2 = API adapter. API docs arrive from the owner (`<<ASK OWNER>>`).
- **CJ Dropshipping / AliExpress:** already integrated; will be re-housed behind the new adapter interface without behavior change.
- Future (Phase 6, not now): Printful, BigBuy, direct-brand partners.

---

## 1. Phase overview (build strictly in this order)

| Phase | Deliverable | Launch-blocking for skincare store? |
|---|---|---|
| 1 | `SupplierOrder` refactor — orders split per supplier | YES |
| 2 | `SupplierAdapter` interface + registry; CJ & AliExpress re-housed; `MANUAL` adapter + admin Fulfillment Queue | YES |
| 3 | Compliance profiles (cosmetics first): INCI enforcement, claims linting, publish gates | YES |
| 4 | Skincare store launch config: products, storefront compliance display, go-live checklist | YES (this IS the launch) |
| 5 | Automation: Nova Engel API adapter + WooBridge (Selfnamed) adapter | No — post-launch upgrade |
| 6 | Platform layer: per-store supplier enablement, Printful/BigBuy adapters, Setup Assistant sourcing tools | No — second store (Nordic) |

Each phase ends with tests green, existing CJ/AliExpress flows verified unbroken, and a short `PHASE_N_NOTES.md` summarizing schema changes and any deviations.

---

## 2. Phase 1 — SupplierOrder refactor

**Problem:** today an `Order` appears to carry a single supplier order ID. A cart mixing suppliers (inevitable once Selfnamed + Nova Engel products coexist in the skincare store) needs N supplier-side orders per customer order, each with independent status and tracking.

### 2.1 Schema changes (Prisma — adapt names to the repo's existing conventions; inspect `schema.prisma` first and follow its style)

```prisma
enum SupplierKey {
  CJ
  ALIEXPRESS
  MANUAL_SELFNAMED
  MANUAL_NOVAENGEL
  MANUAL_DIRECT      // generic direct-brand partners, later
  NOVAENGEL_API      // Phase 5
  WOO_BRIDGE         // Phase 5 (Selfnamed automated)
  PRINTFUL           // Phase 6
  BIGBUY             // Phase 6
}

enum SupplierOrderStatus {
  QUEUED          // created, not yet submitted
  SUBMITTED       // sent to supplier API / created in bridge
  AWAITING_MANUAL // sitting in the admin manual fulfillment queue
  IN_PROGRESS     // supplier processing / production
  SHIPPED         // tracking captured
  ERROR           // submission failed after retries — needs human
  CANCELLED
}

model SupplierOrder {
  id               String              @id @default(cuid())
  orderId          String
  order            Order               @relation(fields: [orderId], references: [id])
  storeId          String              // denormalized for store-scoped queries, consistent with resolveStore pattern
  supplierKey      SupplierKey
  status           SupplierOrderStatus @default(QUEUED)
  externalOrderId  String?             // CJ order id / Woo order id / Nova Engel ref / manual ref typed by owner
  trackingNumber   String?
  trackingCarrier  String?
  trackingUrl      String?
  attempts         Int                 @default(0)
  lastError        String?
  submittedAt      DateTime?
  shippedAt        DateTime?
  createdAt        DateTime            @default(now())
  updatedAt        DateTime            @updatedAt
  items            OrderItem[]         // relation: each OrderItem belongs to exactly one SupplierOrder
  @@index([storeId, status])
  @@index([orderId])
}
```

Changes to existing models (expand-only in this phase):
- `OrderItem`: add `supplierKey SupplierKey?` (denormalized from product at purchase time) and `supplierOrderId String?` + relation.
- `Product` (and/or `ProductVariant` if variants can differ — inspect how CJ variant sourcing is stored today and match it): add `supplierKey SupplierKey?` and a generic `supplierProductRef String?` for the supplier-side identifier. **Keep the existing CJ/AliExpress source-ID columns working in parallel during this phase; write a data migration that backfills `supplierKey` from them.** Removal/renaming of old columns happens only in a later cleanup migration once everything reads the new fields.
- `Order`: derive overall fulfillment state from its supplier orders. Add `fulfillmentStatus` enum: `UNFULFILLED | PARTIALLY_SHIPPED | SHIPPED | HAS_ERROR`, recomputed on every SupplierOrder transition. Do not remove existing order status fields — layer alongside and reconcile with how `Orders` admin page displays status today.

### 2.2 Behavior changes
1. **On payment confirmation (existing Stripe webhook handler):** after the order is marked paid, group `OrderItem`s by `supplierKey` and create one `SupplierOrder` per group. Log to `OrderTimeline` (reuse the existing timeline mechanism — one entry per supplier order created, and one per subsequent transition).
2. **Tracking + emails:** shipping-confirmation email becomes per-`SupplierOrder` (one email per parcel, listing only that parcel's items). Storefront Track Order page and account order view show per-parcel status. Checkout page gets a note (localized, all 5 locales): "Your order may arrive in multiple parcels."
3. **Backfill:** migrate existing orders — one `SupplierOrder` per order wrapping all its items, `supplierKey` from the order's current supplier fields, status mapped from current state. Verify counts match pre/post.
4. **Existing CJ/AliExpress fulfillment code** now reads/writes `SupplierOrder` rows instead of order-level supplier fields — minimal edits in this phase; full re-housing into adapters is Phase 2. CJ webhook handlers and AliExpress polling must update the correct `SupplierOrder` (match by `externalOrderId`).

### 2.3 Tests (must exist before phase closes)
- Order with items from 2 suppliers → exactly 2 SupplierOrders, items correctly attached.
- Single-supplier order → 1 SupplierOrder (no behavior regression).
- CJ webhook updating tracking → correct SupplierOrder transitions to SHIPPED, email sent once (idempotent on webhook redelivery).
- fulfillmentStatus derivation for all combinations (all shipped / some / error present).

---

## 3. Phase 2 — SupplierAdapter interface, registry, MANUAL adapter, Fulfillment Queue

### 3.1 The interface (TypeScript, `backend/src/suppliers/`)

```ts
export interface SupplierAdapter {
  readonly key: SupplierKey;
  readonly capabilities: {
    autoSubmit: boolean;        // false => orders land in manual queue
    hasWebhooks: boolean;       // CJ-style push vs AliExpress-style poll
    tracksInventory: boolean;   // false for made-on-demand (Selfnamed)
    productImport: boolean;     // supports catalog import into our DB
  };

  // Fulfillment
  submitOrder(so: SupplierOrderWithItemsAndAddress): Promise<SubmitResult>;
  // MANUAL adapters implement this as: set status AWAITING_MANUAL, return { manual: true }

  fetchStatus?(so: SupplierOrder): Promise<StatusUpdate | null>; // for polling adapters
  handleWebhook?(payload: unknown, headers: Record<string,string>): Promise<StatusUpdate | null>; // for webhook adapters; MUST validate signatures

  // Catalog (optional per capabilities)
  importProduct?(externalRef: string, storeId: string): Promise<ProductDraft>;
  syncProduct?(product: Product): Promise<ProductSyncResult>;
}
```

Registry: a simple map `SupplierKey -> SupplierAdapter instance`, plus a metadata record per supplier (display name, regions, category strengths, compliance notes) used later by the Setup Assistant (Phase 6). Router rule: **nothing outside `suppliers/` may branch on `SupplierKey`** — all supplier-specific logic lives in adapters. Add a lint rule or code-review note to enforce.

### 3.2 Re-house CJ and AliExpress
Move existing CJ and AliExpress logic behind the interface WITHOUT behavior changes: CJ = `{ autoSubmit: true, hasWebhooks: true, tracksInventory: true, productImport: true }`; AliExpress same but `hasWebhooks: false` (existing 6h polling + daily safety-net becomes the generic polling scheduler calling `fetchStatus` for all poll-style adapters). The existing Import page and Sync alerts keep working — refactor their backend endpoints to call adapter methods.

### 3.3 Submission pipeline with retries
All `submitOrder` calls run through a background job mechanism, not inline in the Stripe webhook request. Inspect the repo for an existing job/cron pattern (the AliExpress 6h poll and daily syncs run somehow — reuse that mechanism); if none is generic enough, add a DB-backed `FulfillmentJob` table + interval worker in the backend service. Retries: exponential backoff (1m, 5m, 30m, 2h, 12h), max 5 attempts, then SupplierOrder → `ERROR` + `lastError` + admin notification (email the owner via Resend). Idempotency: a SupplierOrder that already has `externalOrderId` must never be re-submitted.

### 3.4 MANUAL adapters + admin Fulfillment Queue (the skincare launch workhorse)
`MANUAL_SELFNAMED` and `MANUAL_NOVAENGEL` adapters: `submitOrder` sets `AWAITING_MANUAL` immediately. New admin page **Fulfillment Queue** (add to the admin SPA nav, admin-JWT-protected, store-scoped like every page):

- Table of SupplierOrders in `AWAITING_MANUAL` / `ERROR` (filters: status, supplier, age). Oldest first. Badge count in nav.
- Each row expands to show: items (product name, variant, qty, supplier product ref), customer shipping block, and:
  - **"Copy fulfillment details" button** — copies a plaintext block: recipient name, address lines, city, postcode, country, phone, email, then item list with supplier refs and quantities. Format for fast pasting into the Selfnamed/Nova Engel checkout forms.
  - **"Mark submitted"** — prompts for optional external reference, sets `SUBMITTED`, timestamps, timeline entry.
  - **"Enter tracking"** — inputs: tracking number, carrier (select + free text), optional URL. Sets `SHIPPED`, fires the per-parcel shipping email, timeline entry.
  - **Retry** (for ERROR rows of auto adapters) and **"Move to manual"** (converts an errored auto submission into AWAITING_MANUAL so the owner can fulfill by hand — the universal fallback).
- **Setup Assistant integration:** add tools `list_pending_fulfillments`, `get_fulfillment_details(supplierOrderId)`, `record_tracking(supplierOrderId, trackingNumber, carrier)` so the owner can work the queue conversationally.

### 3.5 Tests
Adapter contract test-suite run against every registered adapter (capabilities honored, idempotent submit). Queue actions (mark submitted / tracking / retry) with timeline + email side effects. CJ/AliExpress regression: existing import + fulfillment integration tests still pass unchanged.

---

## 4. Phase 3 — Compliance profiles (cosmetics first)

### 4.1 Schema
```prisma
enum ComplianceProfile {
  NONE
  COSMETICS
  FOOD_CONTACT   // future: kitchenware
  ELECTRICAL     // future
  TEXTILE        // future
  CHILDREN       // future
}
```
- `Category.complianceProfile ComplianceProfile @default(NONE)` — products inherit from their category; overridable per product.
- `Product` additions: `inciIngredients String?`, `netQuantity String?` (e.g. "50 ml"), `usageWarnings String?`, `responsiblePersonInfo String?` (name + EU address printed on label; for Selfnamed products this comes from Selfnamed — `<<ASK OWNER>>` for exact text). All four must be translatable → extend `ProductTranslation` accordingly (INCI itself is language-independent by law — keep INCI on the base product, translate only warnings/usage).

### 4.2 Enforcement (backend-validated, surfaced in admin UI)
- A product with `complianceProfile = COSMETICS` **cannot be published** (visible on storefront) unless `inciIngredients`, `netQuantity`, and `responsiblePersonInfo` are non-empty. Enforce in the product publish/update endpoint, not just the UI.
- **Claims linting:** maintain `backend/src/compliance/forbiddenClaims.ts` — a per-profile list of forbidden/medical claim terms for COSMETICS (seed list: cures, heals, treats, anti-inflammatory, antibacterial treatment, regenerates cells, repairs DNA, medical, prescription, clinically proven [unless owner supplies substantiation], removes scars, treats acne/eczema/psoriasis — `<<ASK OWNER>>` to confirm/extend; owner validates final list with a professional). Run against title + description + meta on save: **block publish on hard terms, warn on soft terms.** Also wire the same check into the AI product-enhancement flow so AI-generated copy is linted before being saved.
- **Store Health integration:** add compliance checks to the existing auditor — any published cosmetics product missing required fields, or any hard-claim hit, is a critical failure (score cap behavior consistent with existing critical checks).
- **Storefront display:** product detail page for COSMETICS products renders: full INCI list (collapsible section, always crawlable), net quantity near the price, usage warnings, responsible-person line in the product info block. All storefront strings localized (5 locales).

### 4.3 Tests
Publish gates (blocked without INCI, allowed with), claims linter (hard block / soft warn / clean), Store Health compliance rules, storefront rendering snapshot for a cosmetics product in `en` + `it`.

---

## 5. Phase 4 — Skincare store launch (configuration + checklist, minimal code)

Code work is mostly done by now; this phase is configuration, content, and a go-live checklist the agent prepares as `LAUNCH_CHECKLIST_SKINCARE.md`:

1. Create/verify the skincare `Store` row (branding, policies via existing AI-generate + owner review, theme).
2. Products: create Selfnamed own-brand products (`supplierKey = MANUAL_SELFNAMED`, `supplierProductRef` = Selfnamed product identifier as shown in their dashboard, compliance fields complete) and optionally Nova Engel branded products (`MANUAL_NOVAENGEL`, refs = Nova Engel SKUs). `<<ASK OWNER>>` for the product list, prices, and INCI data (Selfnamed provides INCI per product).
3. Shipping zones/rates for launch countries `<<ASK OWNER>>`; prices displayed VAT-inclusive (verify storefront does this today; fix if not).
4. Legal pages reviewed (the platform already has policy pages + withdrawal-relevant Returns page; cross-check against PROJECT_SPEC §9 list — ensure a Right of Withdrawal page with the model form exists as a static/policy page).
5. Flip from test to live: Stripe live keys, Resend sending domain, custom domain (all listed as deferred in CMS_OVERVIEW — they gate THIS launch). `<<ASK OWNER>>`.
6. End-to-end dry run: place a real order for one Selfnamed product to the owner's address → work it through the Fulfillment Queue → enter real tracking → verify emails, Track Order page, timeline. This doubles as the owner's product-quality test.
7. Store Health must be green (no critical failures) before the domain goes public.

**Owner's parallel to-do (agent: include in the checklist, not code):** Selfnamed account + label **design approval** (long lead item — start immediately), billing method on Selfnamed, Nova Engel B2B account application, and — for Phase 5 — VPS + WordPress bridge setup per PROJECT_SPEC §7 runbook, and requesting Nova Engel API docs.

---

## 6. Phase 5 — Automation adapters (post-launch)

### 6.1 `NOVAENGEL_API` adapter (poll-style, mirrors AliExpress pattern)
Implement against official docs supplied by owner (`<<ASK OWNER>>` — do NOT guess endpoints). Scope: product/stock/price sync into existing Import + Sync systems, order submission, status/tracking polling. Products migrate from `MANUAL_NOVAENGEL` to `NOVAENGEL_API` by flipping `supplierKey` (write a small admin action or script for bulk switch). Keep `MANUAL_NOVAENGEL` registered forever as the fallback path via "Move to manual".

### 6.2 `WOO_BRIDGE` adapter (webhook-style, mirrors CJ pattern) — automated Selfnamed
Everything from PROJECT_SPEC §5 applies; summary of the contract:
- `submitOrder`: `POST {WOO_BRIDGE_BASE_URL}/wp-json/wc/v3/orders`, Basic Auth (consumer key/secret, HTTPS only), body: `status: "processing"`, `set_paid: true`, customer's real shipping/billing details, `line_items: [{ product_id: <Woo product id>, quantity }]`. The Woo `product_id` MUST reference the Selfnamed-plugin-synced product in the bridge → store it in `supplierProductRef` for `WOO_BRIDGE` products. Save returned Woo order id as `externalOrderId`.
- `handleWebhook`: endpoint for Woo `order.updated` webhooks; validate `X-WC-Webhook-Signature` HMAC against `WOO_WEBHOOK_SECRET`; parse status + tracking. **The exact meta key where the Selfnamed plugin writes tracking is unknown until one real order is inspected — implement the parser after examining a live payload (leave a TODO + log full payloads for the first orders).** Also implement `fetchStatus` as a 6h polling fallback.
- Env vars (backend): `WOO_BRIDGE_BASE_URL`, `WOO_CONSUMER_KEY`, `WOO_CONSUMER_SECRET`, `WOO_WEBHOOK_SECRET`.
- Connection health: add a "Test bridge connection" action in the admin Integrations page (`GET /wp-json/wc/v3/orders?per_page=1`).
- Cutover: flip Selfnamed products `MANUAL_SELFNAMED → WOO_BRIDGE`; first automated order is placed to the owner's own address as validation before real customer orders flow through.

### 6.3 Tests
Nova Engel adapter behind mocks from real docs; WooBridge payload snapshot tests; webhook signature validation (valid/invalid/replay); manual→auto supplierKey migration script.

---

## 7. Phase 6 — Platform layer for store #2 (Nordic lifestyle) — scope now, build later

Brief scope so architecture decisions today don't block it:
- **Per-store supplier enablement:** `StoreSupplier` join table (storeId, supplierKey, enabled, settings JSON). Router refuses to create SupplierOrders for non-enabled suppliers; Import page filters by enabled suppliers. Skincare store enables `[MANUAL_SELFNAMED→WOO_BRIDGE, MANUAL_NOVAENGEL→NOVAENGEL_API]`; Nordic store will enable `[CJ, PRINTFUL, BIGBUY, MANUAL_DIRECT]`.
- **PRINTFUL adapter** (excellent public API: catalog, mockups, order submission, webhooks) and **BIGBUY adapter** (`<<ASK OWNER>>` for account/docs).
- **Setup Assistant sourcing tools:** `list_available_suppliers(filters)`, `get_supplier_capabilities(key)`, `get_compliance_requirements(profile)` reading the registry metadata — enabling the "define my store → match suppliers → import" guided flow.
- **Ops hardening (schedule before store #2 goes live, owner decision on timing):** staging database (Neon branch), auto-deploy pipelines replacing manual `railway up` / `vercel --prod`, and the deferred responsive pass — multiple live revenue stores testing against production with `ZZTEST_` rows is not sustainable.

---

## 8. Non-negotiable engineering rules (carry-over + platform-specific)

1. **Never break the live CJ/AliExpress pipeline.** Every phase's PR set runs the full existing test suite plus new tests.
2. **Expand → migrate → contract** for every schema change; destructive migrations only after the code reads new fields everywhere.
3. **Idempotency:** Stripe webhooks, CJ webhooks, Woo webhooks, and job retries must all be safely re-processable. A SupplierOrder with `externalOrderId` is never re-submitted.
4. **All supplier calls in background jobs** with retries; nothing fulfillment-critical inline in web requests.
5. **No supplier branching outside adapters.** The registry is the single source of supplier truth.
6. **Every SupplierOrder state transition writes an `OrderTimeline` entry.**
7. **Compliance gates are backend-enforced**, not UI-only; the AI content paths (Setup Assistant, AI enhancement, AI-generate) pass through the same claims linter as manual edits.
8. **Store scoping everywhere:** every new endpoint/query respects `resolveStore` / `storeId`, same as existing code.
9. Secrets in env vars only; extend the deployment env docs for each new variable.
10. Unknown external shapes (Nova Engel API, Selfnamed tracking meta) are stubbed behind the interface with `// TODO(owner-input)` and listed in `PHASE_N_NOTES.md` — never fabricated.

---

## 9. Open items the owner must supply (agent: maintain this list in the repo README)

- [ ] Selfnamed: account, label designs submitted for approval, billing method, product list + INCI + responsible-person text, product refs
- [ ] Nova Engel: B2B account, chosen SKUs, later API docs + credentials
- [ ] Launch config: countries/shipping rates, prices, final policy texts (professional review), forbidden-claims list confirmation
- [ ] Go-live infrastructure: custom domain, live Stripe keys, Resend domain
- [ ] Phase 5: bridge VPS set up per runbook, Woo REST keys + webhook secret, one real order's webhook payload for the tracking parser
- [ ] Phase 6: Printful/BigBuy accounts, Nordic store brand direction
