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

## Heads up: this folder is sometimes open in more than one Claude Code window at once

The user works from multiple windows pointed at this same physical folder — not separate clones, the same working tree and `.git`. That means:
- **Another session's uncommitted work, checked-out branch, or in-progress commits can be sitting there when you start.** Always run `git status` and `git branch --show-current` before committing anything — a plain `git commit` lands on whatever branch HEAD happens to be on, which may not be `main` and may not be a branch you created.
- If you find a branch/commit you don't recognize, don't assume it's stray or safe to discard — check the author and commit message first (real work from the other session looks like `Author: letqo <ayassoujaphet@gmail.com>`, same co-author trailer style as yours). Leave other sessions' in-progress branches alone; don't merge them to `main` without being asked, even if they look complete.
- If your own commit lands on the wrong branch by accident: `git checkout main && git cherry-pick <sha>`, then go reset the other branch back to its prior tip (`git checkout <branch> && git reset --hard <sha-before-yours>`) to restore it exactly as the other session left it.

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
- **Env vars with silent, plausible-looking defaults can mask a completely broken feature.** `STRIPE_WEBHOOK_SECRET` defaulted to `''` in `backend/src/config/env.ts` — nothing crashed, no error was ever logged anywhere visible, but every Stripe webhook event was silently rejected (signature can't match an empty secret), so **paid orders never flipped to `PAID`/`CONFIRMED`, ever**, since launch. Found 2026-08-03 by deliberately checking `railway variables` against what the code actually reads, not by an error surfacing on its own. Same category of bug as `EMAIL_FROM` defaulting to `noreply@precisie.eu` — worth deliberately auditing every `z.string().default(...)` in `env.ts` against what's actually set on Railway, since none of them fail loudly when missing.
- **Never print a raw secret value to your own visible output** (a `railway variables --json` piped straight to a display, `cat .env`, etc.) — the harness's classifier will block it, and it's the right instinct anyway. To use a secret (e.g. calling an external API with it), write a script that reads it and uses it entirely inside a subprocess, printing only a redacted preview or the final result — see how `STRIPE_WEBHOOK_SECRET` was created this way on 2026-08-03 (read `STRIPE_SECRET_KEY` internally, called Stripe's API directly, set the result back on Railway, never echoed either secret).

## Where things stand (2026-08-03)

- Phase 1+2 fulfillment (SupplierOrder split, retry/backoff, Fulfillment Queue admin page): **done**, verified.
- STILL storefront theme matches its design mockup (hero device illustration, spec-strip, plate product cards, utility bar with live clock, etc.) — verified against the actual mockup source, not just a summary of it.
- Supplier platform expansion (Printful/Gelato/BigBuy/WooBridge adapters, per-store supplier enablement, compliance profiles) — built overnight 2026-08-03 on a branch, merged and deployed to production the same day. See `OVERNIGHT_BUILD_NOTES.md` for the full list of judgment calls and explicit follow-ups (Gelato needs a print-asset model it doesn't have yet; no webhook *routes* are mounted for the new suppliers, only the parsing/verification logic; no automated tests exist in this repo at all).
- **Stripe webhook fixed 2026-08-03** — `STRIPE_WEBHOOK_SECRET` is now set (test-mode endpoint `we_1U0MrLArnGPWOkHrmvr9rwGe`, created via the Stripe API, listening for `payment_intent.succeeded`/`payment_intent.payment_failed`). Before this, real checkouts never actually completed on the backend side — see the gotchas section above. `EMAIL_FROM_NAME` also fixed, now `STILL` instead of the generic default.
- **Checkout country dropdown — done, not yet merged.** Branch `feature/checkout-country-dropdown` (commit `3d70cf2`, built in a parallel session) ports the same fix already shipped in `my-store` (`f744c16`): free-text country input → a `<select>` built from `Store.targetMarkets`, localized via `Intl.DisplayNames`. Looks complete and correct; merge to `main` and deploy whenever ready.
- **Not yet done**: `EMAIL_FROM` address still reads `noreply@precisie.eu` (only verified domain in the shared Resend account) — needs STILL's own custom domain to fix properly. VAT/IOSS handling (checkout charges $0 tax; the user is France-based, not yet IOSS-registered — this matters because fulfillment ships from outside the EU, so IOSS applies, not standard OSS, and only below the ¬150/parcel threshold). Custom domain. Live (non-test) Stripe keys — and note a **second, live-mode** webhook endpoint will need creating when that happens, the one that exists now is test-mode only.

## User context

Non-technical founder — prefers me to handle infrastructure/deployment directly rather than handing back manual instructions, and to verify claims (typecheck, curl the live site, re-check agent reports) rather than just asserting things are done. Explicit branch-workflow preference: significant/structural changes go on a git branch, reviewed, then merged — not committed directly to `main` unsupervised.
