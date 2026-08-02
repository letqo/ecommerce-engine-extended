# Launch Checklist — new store instance

This repo is a fork of the precisie.eu commerce platform, standing on its own: separate
GitHub repo, separate database, separate Railway/Vercel deployments. Nothing here shares
runtime or data with the original store.

## 1. Infrastructure (you provision these — separate accounts/projects, can't be done by an agent)

- [ ] **GitHub**: new private repo. From this folder:
      ```
      git remote add origin <your-new-repo-url>
      git push -u origin main
      ```
- [ ] **Neon**: new Postgres project → copy `DATABASE_URL` and `DIRECT_DATABASE_URL` (pooled + direct connection strings).
- [ ] **Railway**: new project, deploy from the GitHub repo, root directory `backend`. It already has `backend/railway.json` (Nixpacks build: `npm run build && npx prisma migrate deploy && node dist/index.js`, healthcheck `/health`) — no changes needed there.
- [ ] **Vercel**: two new projects from the same repo — one rooted at `admin` (Vite SPA), one rooted at `storefront` (Next.js).

## 2. Environment variables

**Backend (Railway):**
| Var | Notes |
|---|---|
| `DATABASE_URL`, `DIRECT_DATABASE_URL` | From the new Neon project |
| `JWT_SECRET`, `JWT_CUSTOMER_SECRET` | Generate fresh — **must differ** from precisie.eu's. `openssl rand -hex 32` twice |
| `JWT_EXPIRES_IN=24h`, `JWT_CUSTOMER_EXPIRES_IN=7d` | Same as default |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | Test keys to start. Same Stripe account is fine — this just needs its own webhook endpoint (pointed at the new backend's `/api/webhooks/stripe`) with its own signing secret |
| `RESEND_API_KEY` | Same Resend account is fine |
| `EMAIL_FROM`, `EMAIL_FROM_NAME` | This brand's sending address/name — don't reuse Precisie's |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Same account is fine, images are namespaced by URL |
| `BACKEND_URL`, `STORE_URL`, `ADMIN_URL` | New Railway/Vercel URLs |
| `ANTHROPIC_API_KEY` | Reuse |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Only read once by `npm run db:seed` — pick a **new** password, don't reuse precisie.eu's. Omit the password to get a random one generated and printed instead |
| `CJ_API_*` | Leave unset unless this store ends up using CJ Dropshipping — the AliExpress adapter in `backend/src/suppliers/registry.ts` only activates when `ALIEXPRESS_APP_KEY` is set, so it degrades gracefully without CJ creds |

**Admin (Vercel):** `VITE_API_URL` → the new backend URL.

**Storefront (Vercel):** `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_STORE_ID` (use `default`, same convention as the original), `NEXT_PUBLIC_STORE_URL`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

## 3. First deploy

- [ ] After Railway's first deploy succeeds (runs migrations automatically), run the seed once: `SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... npm run db:seed --workspace=backend` (from your machine, pointed at the new `DATABASE_URL`) — creates the `default` Store row, an admin login, base categories, and a US shipping zone. Built-in themes seed themselves automatically on every backend boot.
- [ ] Confirm `<backend-url>/health` returns 200.
- [ ] Log into the admin with the seeded credentials; confirm the storefront loads (empty catalog).
- **Local dev gotcha**: after `npm install`, the Prisma client isn't generated automatically (no `postinstall` hook — Railway's Nixpacks builder handles this in production, but locally you need to run it yourself): `npm run db:generate --workspace=backend`.

## 4. Brand + catalog

- [ ] Set the store name/branding (Settings page) — seeded as a placeholder `"New Store"`.
- [ ] Upload the theme JSON (per `THEME_SPEC.md`) via admin → Themes.
- [ ] Good Display products (frames, calendar displays): add via the normal "New Product" form — no supplier ID needed, just set `Vendor: Good Display` and put the model number (e.g. `GDP073EW1`) in the variant SKU field.
- [ ] NFC/pendant/phone-case items: import via the existing AliExpress import flow once sourced.

## 5. Fulfillment (Good Display has no ordering API — manual for now)

- Every order lands `UNFULFILLED` until you act on it — same as any order today with no matched CJ/AliExpress variant.
- On the order detail page, **"Copy details"** (added in this fork) copies a paste-ready block — recipient, address, items with SKUs — for Good Display's inquiry form or a reseller checkout.
- Enter the resulting tracking number via the existing **"Fulfill"** button — this sets the order to `SHIPPED`, fires the shipping + review emails, and updates `/track-order`, unchanged from today's behavior.
- Known limitation: tracking is one field per *order*, not per parcel. If a single order mixes a Good Display item and an auto-fulfilled item, only build a real multi-parcel model (`PLATFORM_UPGRADE_SPEC.md`'s `SupplierOrder` approach, from the original repo) if this becomes a frequent, not edge, case — until then, note the second tracking number as an order note.

## 6. Go live

- [ ] Custom domain (deferrable — launch on the free Railway/Vercel subdomains first, same as precisie.eu did)
- [ ] Switch Stripe to live keys
- [ ] Resend sending domain verified
- [ ] End-to-end dry run: place a real order to your own address, work it through §5, confirm the shipping email and `/track-order` page
