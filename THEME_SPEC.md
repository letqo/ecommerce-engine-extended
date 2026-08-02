# Theme Design Specification

This document describes the theme format for the Precisie storefront. Use it to design a theme JSON file that can be uploaded through the admin panel.

## Theme JSON Format

A theme is a single JSON file with this structure:

```json
{
  "name": "Your Theme Name",
  "description": "Short description of the theme",
  "vars": {
    "--primary": "#000000",
    "--primary-hover": "#1a1a1a",
    "--primary-text": "#ffffff",
    "--accent": "#6366f1",
    "--hero-bg": "linear-gradient(135deg, #111827 0%, #374151 100%)",
    "--hero-text": "#ffffff",
    "--hero-sub": "#d1d5db",
    "--footer-bg": "#111827",
    "--footer-text": "#9ca3af",
    "--font-sans": "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    "--radius-btn": "0.75rem",
    "--radius-card": "0.75rem"
  },
  "css": "",
  "sections": {
    "header": { "variant": "default" },
    "footer": { "variant": "default" },
    "home": [
      { "type": "hero", "variant": "default" },
      { "type": "featured-products", "variant": "grid-4" }
    ],
    "productsGrid": "grid-4",
    "productDetail": "side-by-side",
    "productCard": "default",
    "cartLayout": "sidebar",
    "checkoutLayout": "two-column"
  }
}
```

All 12 variables in `vars` are **required**. The `css` field is optional — leave it as `""` for a color/font-only theme, or add custom CSS for deeper visual changes. The `sections` field is **entirely optional** — themes without it use the default layout. Each sub-field within `sections` is also optional.

---

## CSS Variables Reference

| Variable | Controls | Accepts | Used in |
|---|---|---|---|
| `--primary` | Main button & accent color | Hex color | Buttons, cart badge, selected states |
| `--primary-hover` | Button hover state | Hex color | Button hover |
| `--primary-text` | Text on primary-colored elements | Hex color | Button text, badge text |
| `--accent` | Secondary accent color | Hex color | Link highlights, decorative elements |
| `--hero-bg` | Hero banner background | CSS gradient or hex color | Hero section |
| `--hero-text` | Hero headline text color | Hex color | Hero h1 |
| `--hero-sub` | Hero subtitle text color | Hex color | Hero paragraph |
| `--footer-bg` | Footer background | Hex color | Footer section |
| `--footer-text` | Footer text color | Hex color | Footer links & text |
| `--font-sans` | Body font family | CSS font-family string | Entire site |
| `--radius-btn` | Button border radius | CSS length or `9999px` for pill | All buttons |
| `--radius-card` | Card border radius | CSS length | Product cards, panels |

**Tip:** For Google Fonts, add `@import url(...)` at the start of the `css` field, then reference the font in `--font-sans`.

---

## Layout Sections

The `sections` field controls **page structure** — which sections appear, in what order, and with which layout variant. This allows a single theme JSON to create completely different store layouts (Allbirds, Everlane, Zara, Glossier) without touching code.

### Default values (used when `sections` is absent or a sub-field is omitted):

```json
{
  "header": { "variant": "default" },
  "footer": { "variant": "default" },
  "home": [
    { "type": "hero", "variant": "default" },
    { "type": "featured-products", "variant": "grid-4" }
  ],
  "productsGrid": "grid-4",
  "productDetail": "side-by-side",
  "productCard": "default",
  "cartLayout": "sidebar",
  "checkoutLayout": "two-column"
}
```

### All Section Types & Variants

#### Header — 4 variants

| Variant | Description |
|---------|-------------|
| `default` | Single row: logo left, nav center, actions (search/user/cart/locale) right. Height h-16. |
| `centered` | Three visual rows: actions top, logo center, nav bottom. Uses flex-wrap + order on the same elements. |
| `overlay` | Same as default layout but `position: fixed`, transparent background, white text/icons. Floats over the hero. |
| `two-tier` | Two rows: thin utility bar (locale + icons) on top, logo + nav below. |

#### Hero — 5 variants

| Variant | Description |
|---------|-------------|
| `default` | Left-aligned text in max-w-2xl, padded py-24. |
| `centered` | Full viewport (min-h-80vh), centered text, larger title (text-5xl+). |
| `split` | Two-column: text left, decorative visual area right (targetable via `.theme-hero-visual`). |
| `banner` | Thin minimal strip (py-8), title + CTA inline on one row. Compact so products dominate the page. |
| `showcase` | Product-focused split: editorial text left, large showcase area right (targetable via `.theme-hero-showcase`). |

#### Home Page Sections — Reorderable

The `home` array controls which sections appear on the home page and in what order. Available section types:

| Type | Variants | Description | Extra fields |
|------|----------|-------------|--------------|
| `hero` | default, centered, split, banner, showcase | Hero banner (see above) | — |
| `featured-products` | grid-4, grid-2, bento, carousel | Featured products display | `heading` |
| `newsletter` | banner, compact | Newsletter signup section (auto-hides footer newsletter) | — |
| `brand-statement` | _(no variants)_ | Centered brand text — styled via CSS | — |
| `categories` | grid, scroll | Clickable category cards with image + name | `heading` |
| `testimonials` | grid, carousel | Customer reviews / social proof | `heading`, `items` (see below) |
| `trust-badges` | default, compact | Icons row (shipping, security, returns) | `items` (see below) |
| `promo-banner` | default, with-image | Promotional strip with CTA | `text`, `cta`, `imageUrl` |
| `image-with-text` | _(no variants)_ | Split section: image + text + CTA | `heading`, `text`, `cta`, `imageUrl`, `imagePosition` (left/right) |
| `brand-logos` | _(no variants)_ | Logo row ("As seen in" / "Trusted by") | `heading`, `items` (see below) |
| `new-arrivals` | grid-4, grid-2, carousel | Latest products (auto-fetched by date) | `heading` |
| `best-sellers` | grid-4, grid-2, carousel | Top-selling products (auto-fetched by sales) | `heading` |
| `countdown` | _(no variants)_ | Sale countdown timer | `heading`, `text`, `cta`, `targetDate` (ISO date) |
| `faq` | _(no variants)_ | Collapsible Q&A | `heading`, `items` (see below) |
| `video` | _(no variants)_ | Embedded video (YouTube, Vimeo, or direct) | `heading`, `text`, `videoUrl` |
| `blog-posts` | grid, list | Recent blog articles (auto-fetched) | `heading` |
| `icon-row` | _(no variants)_ | Quick-link icons row | `heading`, `items` (see below) |

#### Items format for content sections

**Testimonials items:**
```json
{ "name": "Jane D.", "text": "Amazing quality!", "rating": 5 }
```

**Trust badges items:**
```json
{ "icon": "shield", "label": "Secure Payment", "description": "256-bit SSL encryption" }
```
Available icons: `shield`, `truck`, `refresh`, `clock`, `award`, `headphones`, `credit-card`, `lock`

**Brand logos items:**
```json
{ "src": "/brands/logo.png", "alt": "Brand Name", "href": "https://brand.com" }
```

**FAQ items:**
```json
{ "question": "How long does shipping take?", "answer": "3-7 business days." }
```

**Icon row items:**
```json
{ "icon": "gem", "label": "Jewelry", "href": "/products?category=jewelry" }
```
Available icons: `sparkles`, `droplets`, `palette`, `leaf`, `sun`, `gem`, `coffee`, `shirt`, `home`, `zap`

#### Header Navigation

The header supports custom navigation items via `navItems` in the header config. Items can have dropdown children:

```json
"header": {
  "variant": "default",
  "navItems": [
    { "label": "Shop", "href": "/products" },
    { "label": "Collections", "href": "/products", "children": [
      { "label": "New Arrivals", "href": "/products?sort=createdAt_desc" },
      { "label": "Best Sellers", "href": "/products?tag=best-seller" },
      { "label": "Sale", "href": "/products?tag=sale" }
    ]},
    { "label": "Blog", "href": "/blog" },
    { "label": "About", "href": "/about" }
  ]
}
```
If `navItems` is omitted, the header shows the default Shop (with category dropdown) and Blog links.

#### Announcement Bar

Add a scrolling announcement bar above the header:

```json
"announcementBar": {
  "messages": ["Free shipping on orders over $50", "Summer Sale — 20% off everything"]
}
```

You can reorder, add, or remove any of these. Example: newsletter first, then products, no hero:
```json
"home": [
  { "type": "newsletter", "variant": "banner" },
  { "type": "featured-products", "variant": "bento" }
]
```

#### Featured Products (Home) — 4 variants

| Variant | Description |
|---------|-------------|
| `grid-4` | Current: 4-column responsive grid (2 cols mobile, 3 tablet, 4 desktop). |
| `grid-2` | Large cards: 2-column grid with bigger product images. |
| `bento` | First product spans 2x2 (hero cell), remaining in normal grid. |
| `carousel` | Horizontal scrolling strip with snap-scroll. |

#### Newsletter (Home) — 2 variants

| Variant | Description |
|---------|-------------|
| `banner` | Full-width dark section with heading + description + form. |
| `compact` | Inline: label on left, form on right, no background. |

#### Product Card — 3 variants

| Variant | Description |
|---------|-------------|
| `default` | Image on top (square), title below, price below that. |
| `overlay` | Text overlaid on image with gradient — title and price in white at bottom. |
| `detailed` | Like default but adds star rating placeholder and quick-view button. |

#### Products Page Grid — 3 variants

| Variant | Description |
|---------|-------------|
| `grid-4` | 4-column responsive grid (current). |
| `grid-3` | 3-column grid. |
| `grid-2` | 2-column grid with larger cards. |

#### Product Detail — 3 variants

| Variant | Description |
|---------|-------------|
| `side-by-side` | Current: image left, info right (2-column grid). |
| `stacked` | Vertical: large image on top (4:3 ratio), centered info below. |
| `gallery-sticky` | All images stacked vertically on left, info sticky on right (ASOS/Zara pattern). |

#### Cart — 2 variants

| Variant | Description |
|---------|-------------|
| `sidebar` | Current: items left (2 cols), sticky summary sidebar right. |
| `bottom-bar` | Full-width items, fixed checkout bar at bottom of screen. |

#### Checkout — 2 variants

| Variant | Description |
|---------|-------------|
| `two-column` | Current: form left, order summary right. |
| `single-column` | Centered narrow column with step indicator (1. Info → 2. Payment) and collapsible summary. |

#### Footer — 4 variants

| Variant | Description |
|---------|-------------|
| `default` | Current: newsletter banner + 4-column links + copyright. |
| `minimal` | No newsletter. Single centered row of links + copyright. |
| `newsletter` | Large newsletter section dominates, links stacked below. |
| `mega` | Brand name + tagline + newsletter on left, link columns on right. |

---

## CSS Variant Targeting

Every component with variants adds a `data-variant` attribute. You can combine `data-theme-section` and `data-variant` selectors in your CSS to target specific layout variants:

```css
/* Style the hero differently when it's in centered mode */
[data-theme-section="hero"][data-variant="centered"] {
  background: radial-gradient(circle, #1a1a2e, #0d0d0d);
}
[data-theme-section="hero"][data-variant="centered"] .theme-hero-title {
  font-size: 4rem;
  letter-spacing: -0.02em;
}

/* Style the split hero's visual area */
[data-theme-section="hero"][data-variant="split"] .theme-hero-visual {
  background-image: url('...');
  background-size: cover;
}

/* Style overlay cards differently */
[data-theme-section="product-card"][data-variant="overlay"] {
  border-radius: 0;
}

/* Style the header when it's in overlay mode */
[data-theme-section="header"][data-variant="overlay"] {
  backdrop-filter: blur(8px);
  background: rgba(0, 0, 0, 0.3);
}
```

### New CSS-targetable sections (added by the sections system)

| Section | Attribute | Class |
|---|---|---|
| Home newsletter | `data-theme-section="home-newsletter"` | `.theme-home-newsletter` |
| Home brand statement | `data-theme-section="home-brand"` | `.theme-home-brand` |
| Categories | `data-theme-section="home-categories"` | `.theme-home-categories` |
| Testimonials | `data-theme-section="home-testimonials"` | `.theme-home-testimonials` |
| Trust badges | `data-theme-section="home-trust"` | `.theme-home-trust` |
| Promo banner | `data-theme-section="home-promo"` | `.theme-home-promo` |
| Image with text | `data-theme-section="home-image-text"` | `.theme-home-image-text` |
| Brand logos | `data-theme-section="home-logos"` | `.theme-home-logos` |
| New arrivals | `data-theme-section="home-new-arrivals"` | `.theme-home-new-arrivals` |
| Best sellers | `data-theme-section="home-best-sellers"` | `.theme-home-best-sellers` |
| Countdown | `data-theme-section="home-countdown"` | `.theme-home-countdown` |
| FAQ | `data-theme-section="home-faq"` | `.theme-home-faq` |
| Video | `data-theme-section="home-video"` | `.theme-home-video` |
| Blog posts | `data-theme-section="home-blog"` | `.theme-home-blog` |
| Icon row | `data-theme-section="home-icon-row"` | `.theme-home-icon-row` |
| Announcement bar | `data-theme-section="announcement-bar"` | `.theme-announcement-bar` |

### New CSS-targetable classes (added by specific variants)

| Class | Appears in | Use for |
|---|---|---|
| `.theme-hero-visual` | Hero `split` variant | Right column decorative area — set background image |
| `.theme-hero-showcase` | Hero `showcase` variant | Product spotlight area — set background image |
| `.theme-card-rating` | Product card `detailed` variant | Star rating row |
| `.theme-card-action` | Product card `detailed` variant | Quick-view button |

---

## Custom CSS — Targeting Sections

Every major section has a `data-theme-section` attribute you can target in CSS. These selectors have enough specificity to override the default Tailwind styling.

### Header (`data-theme-section="header"`)

```
<header data-theme-section="header" data-variant="default" class="theme-header sticky top-0 z-50 bg-white border-b border-gray-200">
  <div class="max-w-7xl mx-auto px-4 ...">
    <div class="flex items-center justify-between h-16">
      <a class="theme-header-logo text-xl font-bold ...">Precisie</a>
      <nav class="theme-header-nav hidden md:flex items-center gap-8">
        <a>Shop</a>
        <a>Blog</a>
      </nav>
      <div class="theme-header-actions flex items-center gap-4">
        <select class="theme-header-locale ...">...</select>
        <a><!-- Search icon --></a>
        <a><!-- User icon --></a>
        <a><!-- Cart icon + badge -->
          <span class="theme-header-cart-badge ...">2</span>
        </a>
      </div>
    </div>
  </div>
  <div class="theme-slot theme-slot-header-after" aria-hidden="true"></div>
</header>
```

Example CSS:
```css
[data-theme-section="header"] {
  background: #1a1a2e;
  border-bottom: 2px solid #e2b04a;
}
[data-theme-section="header"] .theme-header-logo {
  color: #e2b04a;
}
[data-theme-section="header"] .theme-header-nav a {
  color: #ccc;
}
[data-theme-section="header"] .theme-header-nav a:hover {
  color: #fff;
}
[data-theme-section="header"] .theme-header-actions a {
  color: #ccc;
}
```

### Hero Banner (`data-theme-section="hero"`)

```
<section data-theme-section="hero" data-variant="default" class="theme-hero relative" style="background: var(--hero-bg)">
  <div class="theme-slot theme-slot-hero-before" aria-hidden="true"></div>
  <div class="max-w-7xl mx-auto px-4 ... py-24 md:py-32">
    <div class="theme-hero-content max-w-2xl">
      <h1 class="theme-hero-title text-4xl md:text-6xl font-bold ...">...</h1>
      <p class="theme-hero-subtitle text-lg md:text-xl ...">...</p>
      <a class="theme-hero-cta inline-block bg-white text-gray-900 font-semibold px-8 py-4 rounded-btn ...">Shop Now</a>
    </div>
  </div>
  <div class="theme-slot theme-slot-hero-after" aria-hidden="true"></div>
</section>
```

Example CSS:
```css
[data-theme-section="hero"] .theme-hero-cta {
  background: #e2b04a;
  color: #1a1a2e;
}
[data-theme-section="hero"] .theme-hero-cta:hover {
  background: #c9993f;
}
/* Add a decorative overlay */
[data-theme-section="hero"] .theme-slot-hero-before {
  display: block;
  position: absolute;
  inset: 0;
  background: url('data:image/svg+xml,...') repeat;
  opacity: 0.05;
  pointer-events: none;
}
```

### Product Card (`data-theme-section="product-card"`)

```
<a data-theme-section="product-card" data-variant="default" class="theme-product-card group block">
  <div class="theme-card-image relative aspect-square overflow-hidden rounded-xl bg-gray-100 mb-3">
    <img ...>
    <div class="theme-slot theme-slot-card-badge" aria-hidden="true"></div>
  </div>
  <h3 class="theme-card-title font-medium text-gray-900 text-sm truncate">Product Name</h3>
  <div class="theme-card-price flex items-center gap-2 mt-1">
    <span class="font-semibold text-gray-900">$29.99</span>
    <span class="theme-card-compare-price text-sm text-gray-400 line-through">$49.99</span>
  </div>
</a>
```

Example CSS:
```css
[data-theme-section="product-card"] .theme-card-image {
  border-radius: 0;
}
[data-theme-section="product-card"]:hover .theme-card-title {
  color: var(--primary);
}
/* Add a "NEW" badge */
[data-theme-section="product-card"] .theme-slot-card-badge {
  display: block;
  position: absolute;
  top: 8px;
  left: 8px;
}
[data-theme-section="product-card"] .theme-slot-card-badge::after {
  content: 'NEW';
  background: var(--accent);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
}
```

### Footer (`data-theme-section="footer"`)

```
<footer data-theme-section="footer" data-variant="default" class="theme-footer bg-footer-bg text-footer-text mt-auto">
  <div class="max-w-7xl mx-auto px-4 ... py-12">
    <div class="theme-slot theme-slot-footer-before" aria-hidden="true"></div>
    <div class="theme-footer-newsletter rounded-2xl bg-white/10 px-6 py-8 mb-10 ...">
      <!-- Newsletter heading + form -->
    </div>
    <div class="theme-footer-links grid grid-cols-2 md:grid-cols-4 gap-8">
      <!-- 4 columns: brand, shop, support, legal -->
    </div>
    <div class="theme-footer-copyright border-t border-white/10 mt-10 pt-6 text-sm text-center">
      <!-- Copyright text -->
    </div>
  </div>
</footer>
```

### Newsletter Form (`data-theme-section="newsletter"`)

```
<form data-theme-section="newsletter" class="theme-newsletter flex gap-2 max-w-sm">
  <input class="theme-newsletter-input ..." placeholder="Your email address">
  <button class="theme-newsletter-button ...">Subscribe</button>
</form>
```

### Page Sections

| Section | Attribute | Class | Description |
|---|---|---|---|
| Home featured products | `data-theme-section="home-featured"` | `.theme-home-featured` | Featured products section on home page |
| Home newsletter | `data-theme-section="home-newsletter"` | `.theme-home-newsletter` | Newsletter section on home page |
| Home brand statement | `data-theme-section="home-brand"` | `.theme-home-brand` | Brand text section on home page |
| Product grid | `data-theme-section="product-grid"` | `.theme-product-grid` | The grid of product cards |
| Products page | `data-theme-section="products-page"` | `.theme-products-page` | Entire products listing page |
| Product detail | `data-theme-section="product-detail"` | `.theme-product-detail` | Single product page |
| Blog list | `data-theme-section="blog-list"` | `.theme-blog-list` | Blog posts listing page |
| Blog post | `data-theme-section="blog-post"` | `.theme-blog-post` | Single blog post page |
| Search overlay | `data-theme-section="search-overlay"` | `.theme-search-overlay` | Full-screen search modal |
| Product filters | `data-theme-section="product-filters"` | `.theme-product-filters` | Sort dropdown + price range filters |
| Content page | `data-theme-section="content-page"` | `.theme-content-page` | Policy, About, FAQ pages |

### Search Overlay (`data-theme-section="search-overlay"`)

```
<div data-theme-section="search-overlay" class="theme-search-overlay fixed inset-0 z-[60]">
  <div class="bg-black/40"><!-- backdrop --></div>
  <div class="theme-search-panel bg-white max-w-2xl mx-auto rounded-2xl">
    <div class="theme-search-input-row flex items-center gap-3 px-5 py-4 border-b">
      <!-- Search icon -->
      <input class="theme-search-input flex-1 text-lg ..." />
      <!-- Close button -->
    </div>
    <div class="theme-search-results max-h-[60vh] overflow-y-auto">
      <button class="theme-search-result flex items-center gap-4 px-5 py-3 ...">
        <!-- Image + title + price per result -->
      </button>
      <button class="theme-search-view-all ...">View all results</button>
    </div>
  </div>
</div>
```

### Product Filters (`data-theme-section="product-filters"`)

```
<div data-theme-section="product-filters" class="theme-product-filters mb-6">
  <div class="flex items-center justify-between gap-4">
    <div>
      <div class="theme-filter-search-tag ..."><!-- active search term chip --></div>
      <button class="theme-filter-toggle ...">Filters</button>
    </div>
    <select class="theme-sort-select ..."><!-- sort dropdown --></select>
  </div>
  <div class="theme-filter-panel mt-4 p-4 border rounded-xl bg-gray-50">
    <input class="theme-filter-input ..." /> <!-- min price -->
    <input class="theme-filter-input ..." /> <!-- max price -->
    <button class="theme-filter-apply ...">Apply</button>
  </div>
</div>
```

---

## Slot Divs

Slot divs are empty `<div>` elements hidden by default. Themes can show them and use CSS `::before` / `::after` to add decorative content.

| Slot class | Location | Use for |
|---|---|---|
| `.theme-slot-header-after` | End of header | Announcement bars, decorative borders |
| `.theme-slot-hero-before` | Start of hero section | Background overlays, patterns |
| `.theme-slot-hero-after` | End of hero section | Decorative dividers, wave shapes |
| `.theme-slot-card-badge` | Top-left of product card image | Badges like "NEW", "SALE" |
| `.theme-slot-footer-before` | Start of footer content | Decorative borders, extra content |

To use a slot:
```css
.theme-slot-hero-after {
  display: block;
  height: 60px;
  background: linear-gradient(to right, #e2b04a, transparent);
}
```

---

## CSS Specificity Rules

- `[data-theme-section="..."]` selectors have specificity `0,1,0` — this overrides Tailwind single-class utilities because the theme CSS loads after Tailwind.
- For stubborn overrides, combine: `[data-theme-section="hero"].theme-hero` gives `0,2,0`.
- Combine with `[data-variant="..."]` for variant-specific styling: `[data-theme-section="hero"][data-variant="centered"]` gives `0,2,0`.
- Avoid `!important` — the load order ensures theme CSS wins.

---

## Guidelines

1. Always output valid JSON — the `css` field must be a properly escaped string
2. Keep CSS under 50KB
3. Use only the documented selectors — don't target internal implementation details
4. Test that `--hero-bg` gradients are valid CSS (e.g. `linear-gradient(135deg, #color1 0%, #color2 100%)`)
5. For Google Fonts, use `@import url(...)` at the start of the `css` string
6. Colors should have good contrast for accessibility
7. The `name` field should be unique and descriptive
8. The `sections` field is optional — omit it entirely for a CSS-only theme that uses the default layout
9. Each sub-field in `sections` is optional — only include the ones you want to change from defaults

---

## Example 1: CSS-Only Dark Luxury Theme (no sections)

```json
{
  "name": "Dark Luxury",
  "description": "Sophisticated dark theme with gold accents",
  "vars": {
    "--primary": "#c9993f",
    "--primary-hover": "#b8862e",
    "--primary-text": "#1a1a1a",
    "--accent": "#e2b04a",
    "--hero-bg": "linear-gradient(135deg, #0d0d0d 0%, #1a1a2e 100%)",
    "--hero-text": "#f5f0e8",
    "--hero-sub": "#c4b89c",
    "--footer-bg": "#0d0d0d",
    "--footer-text": "#8a7e6b",
    "--font-sans": "Georgia, 'Times New Roman', serif",
    "--radius-btn": "0",
    "--radius-card": "0"
  },
  "css": "@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap');\n\n:root { --font-sans: 'Playfair Display', Georgia, serif; }\n\n[data-theme-section=\"header\"] {\n  background: #0d0d0d;\n  border-bottom: 1px solid #2a2520;\n}\n[data-theme-section=\"header\"] .theme-header-logo {\n  color: #e2b04a;\n  letter-spacing: 0.15em;\n  text-transform: uppercase;\n}\n[data-theme-section=\"header\"] .theme-header-nav a {\n  color: #8a7e6b;\n  text-transform: uppercase;\n  letter-spacing: 0.1em;\n  font-size: 0.75rem;\n}\n[data-theme-section=\"header\"] .theme-header-nav a:hover { color: #e2b04a; }\n[data-theme-section=\"header\"] .theme-header-actions a { color: #8a7e6b; }\n[data-theme-section=\"header\"] .theme-header-actions a:hover { color: #e2b04a; }\n\n[data-theme-section=\"hero\"] .theme-hero-cta {\n  background: #e2b04a;\n  color: #0d0d0d;\n  text-transform: uppercase;\n  letter-spacing: 0.1em;\n}\n[data-theme-section=\"hero\"] .theme-hero-cta:hover { background: #c9993f; }\n\nbody { background: #111; color: #f5f0e8; }\n[data-theme-section=\"home-featured\"] h2 { color: #f5f0e8; }\n[data-theme-section=\"product-card\"] .theme-card-title { color: #f5f0e8; }\n[data-theme-section=\"product-card\"] .theme-card-price span { color: #e2b04a; }"
}
```

## Example 2: Luxury Fashion (CSS + sections)

```json
{
  "name": "Luxury Editorial",
  "description": "High-end fashion store with editorial layout",
  "vars": {
    "--primary": "#1a1a1a",
    "--primary-hover": "#333333",
    "--primary-text": "#ffffff",
    "--accent": "#8b6914",
    "--hero-bg": "#f5f0e8",
    "--hero-text": "#1a1a1a",
    "--hero-sub": "#555555",
    "--footer-bg": "#1a1a1a",
    "--footer-text": "#999999",
    "--font-sans": "'Cormorant Garamond', Georgia, serif",
    "--radius-btn": "0",
    "--radius-card": "0"
  },
  "css": "@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&display=swap');",
  "sections": {
    "header": { "variant": "centered" },
    "footer": { "variant": "mega" },
    "home": [
      { "type": "hero", "variant": "split" },
      { "type": "brand-statement" },
      { "type": "featured-products", "variant": "grid-2" },
      { "type": "newsletter", "variant": "banner" }
    ],
    "productsGrid": "grid-2",
    "productDetail": "gallery-sticky",
    "productCard": "overlay",
    "cartLayout": "bottom-bar",
    "checkoutLayout": "single-column"
  }
}
```

## Example 3: Product-First Catalog (CSS + sections)

```json
{
  "name": "Catalog Direct",
  "description": "Products-first store with minimal hero",
  "vars": {
    "--primary": "#2563eb",
    "--primary-hover": "#1d4ed8",
    "--primary-text": "#ffffff",
    "--accent": "#f59e0b",
    "--hero-bg": "#f8fafc",
    "--hero-text": "#0f172a",
    "--hero-sub": "#64748b",
    "--footer-bg": "#0f172a",
    "--footer-text": "#94a3b8",
    "--font-sans": "system-ui, -apple-system, sans-serif",
    "--radius-btn": "0.5rem",
    "--radius-card": "0.75rem"
  },
  "css": "",
  "sections": {
    "header": { "variant": "two-tier" },
    "footer": { "variant": "minimal" },
    "home": [
      { "type": "hero", "variant": "banner" },
      { "type": "featured-products", "variant": "bento" },
      { "type": "newsletter", "variant": "compact" }
    ],
    "productsGrid": "grid-3",
    "productDetail": "stacked",
    "productCard": "detailed"
  }
}
```

## Example 4: Minimal DTC (CSS + sections)

```json
{
  "name": "Minimal Store",
  "description": "Clean direct-to-consumer with overlay header",
  "vars": {
    "--primary": "#000000",
    "--primary-hover": "#222222",
    "--primary-text": "#ffffff",
    "--accent": "#10b981",
    "--hero-bg": "linear-gradient(180deg, #0a0a0a 0%, #1a1a1a 100%)",
    "--hero-text": "#ffffff",
    "--hero-sub": "#a1a1aa",
    "--footer-bg": "#0a0a0a",
    "--footer-text": "#71717a",
    "--font-sans": "'Inter', system-ui, sans-serif",
    "--radius-btn": "9999px",
    "--radius-card": "1rem"
  },
  "css": "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');",
  "sections": {
    "header": { "variant": "overlay" },
    "footer": { "variant": "minimal" },
    "home": [
      { "type": "hero", "variant": "centered" },
      { "type": "featured-products", "variant": "carousel" }
    ],
    "productsGrid": "grid-2",
    "productDetail": "stacked",
    "productCard": "default",
    "cartLayout": "bottom-bar",
    "checkoutLayout": "single-column"
  }
}
```
