# Precisie — CMS / Platform Overview

Last updated: 2026-07-17

This document describes what the platform is, how it's structured, and what it can do today. It's a snapshot of the live system, not a build plan.

## What this is

A self-hosted e-commerce platform for a single dropshipping store (architected so it can later become multi-tenant SaaS). It sources products from CJ Dropshipping and AliExpress, sells them through a customer-facing storefront, and is managed through a custom admin panel — including an AI assistant that can operate the admin panel via chat.

Three separate apps in one repo, deployed as three separate services:

| App | Stack | Deployed to |
|---|---|---|
| `backend` | Node.js, Express, Prisma ORM, Postgres (Neon) | Railway |
| `admin` | React (Vite SPA) | Vercel |
| `storefront` | Next.js (App Router) | Vercel |

All three talk to the same backend API and the same Postgres database.

## Data model

Core Prisma models (`backend/prisma/schema.prisma`):

| Model | Purpose |
|---|---|
| `Store` | Store config — branding, policies, homepage content, sourcing settings |
| `StoreTranslation` | Per-locale variants of store policy/content pages |
| `Theme` / `ThemeTranslation` | Storefront theme definitions + localized theme strings |
| `Admin` | Admin panel users (OWNER / MANAGER / STAFF roles) |
| `Category` / `CategoryTranslation` | Product category tree + localized names |
| `Product` / `ProductTranslation` | Product catalog, including CJ/AliExpress source IDs and sync status |
| `ProductImage`, `ProductOption`, `ProductOptionValue`, `ProductVariant` | Product media and variant structure |
| `Customer` / `CustomerAddress` | Storefront customer accounts and saved addresses |
| `Cart` / `CartItem` | Shopping cart |
| `Discount` | Coupon codes (percentage, fixed, free shipping) |
| `Order` / `OrderItem` / `OrderTimeline` / `Refund` | Orders, line items, status history, refunds — including Stripe and supplier order IDs |
| `ShippingZone` / `ShippingRate` | Shipping cost configuration |
| `EmailSubscriber` | Newsletter signups |
| `AbandonedCart` | Cart recovery tracking |
| `AnalyticsEvent` | Generic storefront event tracking |
| `Page` | Static CMS pages *(legacy — current static pages read `Store` text columns directly, not this model)* |
| `Asset` | Uploaded media library (Cloudinary-backed) |
| `Review` | Product reviews with moderation status |
| `BlogPost` | Blog articles |
| `SetupAssistantSession` | Persisted chat history for the AI setup assistant |

## Admin panel

React SPA at `admin/src/pages/`, one screen per feature area, all behind admin JWT auth:

- **Dashboard** — store overview
- **Setup Assistant** — AI chat that can operate the store (see below)
- **Store Health** — readiness/SEO score (see below)
- **Products** — catalog list + editor
- **Categories** — category tree management
- **Import** (Supplier) — pull products in from CJ Dropshipping / AliExpress
- **Sync** — supplier sync alerts (price/stock drift, failures)
- **Orders** — order list + detail, timeline, refunds
- **Customers** — customer list + detail
- **Discounts** — coupon management
- **Reviews** — moderate product reviews
- **Subscribers** — newsletter list
- **Blog** — blog post editor
- **Themes** — theme picker + per-theme translations
- **Integrations** — third-party service config
- **Settings** — store profile, policies, AI-generate buttons for policy text
- **Stores** — multi-store switcher (architecture supports more than one store per install)
- **Sandbox** — internal test/dev tooling

## Storefront

Next.js App Router site at `storefront/src/app/[locale]/`, all customer-facing pages under a locale segment:

- Home, About, Contact, FAQ
- Products (list + detail `[slug]`)
- Cart, Checkout, Order Confirmation
- Account (login, register, account home), Wishlist
- Blog (list + `[slug]`)
- Track Order (order status by tracking link)
- Policy pages: Privacy, Returns, Shipping, Terms
- Review submission via emailed token (`review/[token]`)
- Newsletter unsubscribe
- `robots.ts`, `sitemap.ts` for SEO

## Internationalization

- **Storefront**: `next-intl`, locales `en, fr, de, it, es` (default `en`), driven by `[locale]` route segment.
- **Admin**: locale-aware editing UI (`LocalePills` component) for translating products, categories, blog posts, themes, and store policy text — backed by the `*Translation` models above.
- **Theme system**: CSS-driven themes, uploaded as JSON via the admin Themes page. Designed against `THEME_SPEC.md` in the repo root. Every storefront feature is expected to expose CSS hooks so themes can restyle it.

## Third-party integrations

| Service | Used for |
|---|---|
| **Stripe** | Payments — checkout, webhooks for payment confirmation |
| **Cloudinary** | Media/asset hosting and upload |
| **Resend** | Transactional email (order confirmations, etc.) |
| **Anthropic (Claude)** | AI content generation, image studio, setup assistant chat |
| **CJ Dropshipping** | Product sourcing, order fulfillment, real-time webhook sync |
| **AliExpress** | Product sourcing, order fulfillment (polling sync, no webhooks) |
| **Google GenAI, remove.bg, Replicate** | Auxiliary image tooling inside Image Studio |

Supplier sync: CJ pushes updates via webhooks in near real-time; AliExpress is polled every 6 hours; both also run a daily safety-net sync. Delivery-time estimates are pulled from CJ/AliExpress freight APIs and shown on the storefront, refreshed daily.

## AI features

- **AI Setup Assistant** — a conversational agent (Claude, tool-calling loop) that can operate nearly the whole admin panel from chat: update store settings, create/edit categories and products, import supplier products, create themes, manage discounts, moderate reviews, manage blog posts, and read the Store Health report. Session history persists per store (`SetupAssistantSession`). Runs with extended thinking explicitly disabled to keep its fixed token budget available for actual tool calls rather than invisible reasoning.
- **Store Health** — a rule-based (non-AI) readiness/SEO auditor. Scores five weighted categories (store SEO, product SEO, category content, site infrastructure, content completeness) 0–100; any failing critical check (e.g. payments or shipping not configured) caps the overall score at 59. Exposed both as an admin dashboard page and as a `get_store_health` tool the Setup Assistant can call directly ("how ready is my store?"). A v2 (traffic/conversion-driven growth recommendations, using `AnalyticsEvent` data) is planned but not yet scoped — it needs real store traffic to be meaningful.
- **AI Generate (Settings)** — sparkle-button content generation for About Us, shipping/return/privacy policy, ToS, and FAQ text.
- **Image Studio** — AI-assisted product image editing: background removal, generation/editing via Google GenAI, plus Claude and Sharp-based processing.
- **AI product enhancement** — rewrites/improves product titles, descriptions, and metadata during import or on demand.

## Auth

- **Admin**: JWT-based, `Admin` model with `OWNER` / `MANAGER` / `STAFF` roles, `requireAdmin` middleware.
- **Storefront**: separate JWT-based customer auth (`Customer` model), login/register flows.
- `resolveStore` middleware sets `req.storeId` on every backend request (header-based, with a first-store fallback) — the architecture that makes multi-store support possible later.

## Deployment

- **Backend** → Railway, deployed via `railway up` (not connected to GitHub auto-deploy — manual CLI deploy required after every push you want live).
- **Admin & Storefront** → Vercel, deployed via `vercel --prod` (also manual, not auto-deploy).
- Single shared Neon Postgres database — no separate staging DB; testing against production uses `ZZTEST_`-prefixed disposable rows, torn down after each test.

## What's deliberately deferred (not built yet)

- Full responsive design pass (admin + storefront) — planned for the very end of the project.
- Store Health v2 (traffic-driven growth recommendations).
- Import UX improvements: profit calculator, better AI rewrite, auto-tags.
- Banggood and DHgate supplier adapters (API access requested, not yet granted).
- Shopee supplier adapter (Southeast Asia / Brazil markets).
- Newsletter signup popup.
- Custom domain, live (non-test) Stripe keys, Resend sending domain.
