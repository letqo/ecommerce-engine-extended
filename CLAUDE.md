# ecommerce-engine-extended — project context

Generalized multi-store ecommerce platform, forked from a sibling project (`my-store`,
elsewhere on this machine). First store built on it: **STILL**, an e-ink photo-frame brand.
This file exists so a fresh Claude Code session opened in *just this folder* has the context
that would otherwise only live in a different conversation's memory.

## Live services (all real, in production)

| Service | URL | Deploy mechanism |
|---|---|---|
| Backend (Railway) | https://backend-production-1c2ee.up.railway.app | **Auto-deploys on `git push origin main`** (GitHub-connected). Its start command runs `npx prisma migrate deploy` against the live Neon Postgres DB as part of every deploy — pushing to `main` with a pending migration applies it for real. |
| Storefront (Vercel) | https://ecommerce-engine-extended-storefron.vercel.app (alias is missing the final "t" — Vercel's alias length limit, not a typo) | Manual: `cd storefront && npx vercel --prod --yes` |
| Admin (Vercel) | https://ecommerce-engine-extended-admin.vercel.app | Manual: `cd <repo root> && npx vercel --prod --yes` — **run from the repo root, not from inside `admin/`** (see gotcha below) |

Admin login: `ayassoujaphet@gmail.com` — password was randomly generated at seed time and never recorded; reset it if lost.

## Vercel gotcha — verify `.vercel/project.json` before every admin/storefront deploy

There are **two separate Vercel projects that both start with "admin"**: a stray project literally named `admin` (wrong, do not use) and the real one, `ecommerce-engine-extended-admin`. If `admin/.vercel/project.json` or the repo-root `.vercel/project.json` ever shows `"projectName":"admin"` instead of `"ecommerce-engine-extended-admin"`, a deploy will silently go to the wrong project and the real live admin panel won't update. Always check `cat .vercel/project.json` before deploying if anything seems off.

Root Directory is configured **differently per project** and there's no CLI flag to see/set it directly:
- `ecommerce-engine-extended-admin`: Root Directory = `admin` → the `.vercel` link and every deploy must happen from the **repo root**.
- `ecommerce-engine-extended-storefront`: Root Directory = `.` → the `.vercel` link and every deploy must happen from **inside `storefront/`**.

## Architecture

- `backend/` — Node/Express/Prisma/Postgres (Neon, `eu-central-1`)
- `admin/` — React (Vite) SPA
- `storefront/` — Next.js App Router, `next-intl` (`en, fr, de, it, es`)

Multi-store: `resolveStore` middleware sets `req.storeId` per request (header-based, first-store fallback). One backend/DB serves every store on the platform.

**Fulfillment**: a `SupplierOrder` model splits one customer order into independently-tracked per-supplier parcels. `SupplierAdapter` interface in `backend/src/suppliers/`, registered in `registry.ts`. CJ and AliExpress are the original, global-credential adapters (real, live). As of 2026-08-03, four more exist — Printful, Gelato, BigBuy, and a generic `WooBridgeAdapter` (for any no-API supplier with a WooCommerce-pluggable backend) — all **per-store configured** via the new `StoreSupplier` table (enable + JSON settings, secrets redacted on read), not global env vars. See `SUPPLIER_FULFILLMENT.md`. None of the four new adapters have real credentials yet — they're structurally real but inert until a store owner enters keys in Admin → Integrations.

**Compliance profiles**: `Category`/`Product.complianceProfile` (NONE/COSMETICS/ELECTRONICS/TOYS_CHILDREN/FOOD_CONTACT/TEXTILE) gate a product from going ACTIVE until profile-required fields are filled in `Product.complianceData`. See `COMPLIANCE_PROFILES.md`.

**Theme system**: CSS-only by design — a theme JSON (`themes/*.json`) can restyle existing components via CSS vars and `data-theme-section`/`.theme-*` hooks, but cannot inject new markup. Matching a specific design mockup requires adding real **component variants** (e.g. `ProductCard`'s `plate` variant, `HeroBanner`'s `showcase` variant) — both backend zod schema (`backend/src/routes/admin/themes.ts`) and storefront types (`storefront/src/themes/index.ts`) must allow new variant names or a theme save gets rejected. See `THEME_SPEC.md`.

## Known gotchas (learned the hard way this session — don't re-discover these)

- **Never wrap `useTranslations()` (or anything using React's `use()`) in try/catch inside a Server Component.** It suspends via an internal throw; a catch block silently eats that and the whole section renders nothing, with no error anywhere. Check the *resolved string* after the call if you need a missing-key guard, not the call itself.
- **Storefront `fetch()` calls should use `cache: 'no-store'`, not `next: { revalidate: N }`.** The time-based revalidate doesn't reliably bust across Vercel deployments — admin changes can appear stuck for far longer than the revalidate window.
- **`NEXT_PUBLIC_API_URL` must include the `/api` suffix.** Storefront fetch helpers assume it. Getting this wrong causes silent 404s (wrapped in try/catch) and a plausible-but-wrong empty-state homepage, not a visible error.
- **`vercel env add` defaults new vars to "Sensitive"**, which makes `vercel env pull` show `[SENSITIVE]` even to the owner. For `NEXT_PUBLIC_*` vars (already public in the JS bundle anyway) always pass `--no-sensitive --value "..." --force --yes`.
- **Prisma migration drift**: this repo's original migration history (copied from `my-store`) didn't cleanly replay on a fresh database — things had been added directly to `my-store`'s live DB outside the migration system. Fixed 2026-08-02 by squashing to one baseline (`prisma/migrations/20260802180000_baseline/`). If migration drift shows up again, diff `prisma db pull --print` against `schema.prisma` on the target DB rather than patching one failure at a time.
- **Generating a new migration should never touch the live database.** The safe pattern used throughout this project: copy the old `schema.prisma` aside, edit the real one, then `npx prisma migrate diff --from-schema-datamodel <old-copy> --to-schema-datamodel prisma/schema.prisma --script` (pure file-to-file, no `DATABASE_URL` needed) into a new migration folder. Never run `migrate dev`/`migrate deploy` from an unattended process.
- **Content with em dashes / curly quotes set via bash/curl can get mangled** (seen once as `�` in `Store.heroSubtext`). Set such content via a small Node script with explicit UTF-8 JSON, not inline shell strings.

## Where things stand (2026-08-03)

- Phase 1+2 fulfillment (SupplierOrder split, retry/backoff, Fulfillment Queue admin page): **done**, verified.
- STILL storefront theme matches its design mockup (hero device illustration, spec-strip, plate product cards, utility bar with live clock, etc.) — verified against the actual mockup source, not just a summary of it.
- Supplier platform expansion (Printful/Gelato/BigBuy/WooBridge adapters, per-store supplier enablement, compliance profiles) — built overnight 2026-08-03 on a branch, merged and deployed to production the same day. See `OVERNIGHT_BUILD_NOTES.md` for the full list of judgment calls and explicit follow-ups (Gelato needs a print-asset model it doesn't have yet; no webhook *routes* are mounted for the new suppliers, only the parsing/verification logic; no automated tests exist in this repo at all).
- **Not yet done**: checkout's country field is still free-text (should be a dropdown driven by the store's configured target markets — this was already fixed once in the sibling `my-store` repo, commit `f744c16` there, just never ported here — a small, well-understood 3-file change, not started). VAT/IOSS handling (checkout charges $0 tax; the user is France-based, not yet IOSS-registered — this matters because fulfillment ships from outside the EU, so IOSS applies, not standard OSS, and only below the ¬150/parcel threshold). Custom domain, live (non-test) Stripe keys.

## User context

Non-technical founder — prefers me to handle infrastructure/deployment directly rather than handing back manual instructions, and to verify claims (typecheck, curl the live site, re-check agent reports) rather than just asserting things are done. Explicit branch-workflow preference: significant/structural changes go on a git branch, reviewed, then merged — not committed directly to `main` unsupervised.
