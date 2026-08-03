# Compliance profiles

Some product categories carry legal disclosure duties: an EU-facing store selling toys owes a
choking-hazard warning and a minimum age; selling electronics owes CE and WEEE details; selling
cosmetics owes an INCI ingredient list and a named EU responsible person. Which fields are owed
depends entirely on what's being sold, and this platform is meant to run many stores selling
very different things.

A **compliance profile** is a named set of required disclosure fields. A category is tagged with
one; every product in it inherits it; a product can override it. **A product cannot be
published (`ACTIVE`) until every field its profile requires is filled in.**

> These are disclosure *requirements*, not legal advice. The mechanism enforces "this field is
> not empty". It does not check that the content is correct, sufficient, or true for your
> jurisdiction.

## How it fits together

```
Category.complianceProfile  ──inherited by──►  Product
                                                 │
Product.complianceProfile ──overrides──────────►─┤  (null = inherit; NONE = explicitly exempt)
                                                 │
                                                 ▼
                                    required fields, from the registry
                                                 │
                              Product.complianceData (JSON key/value)
```

- **`backend/src/lib/complianceProfiles.ts`** is the registry — the only place that knows which
  fields a profile requires. Everything else is generated from it.
- `resolveComplianceProfile(productProfile, categoryProfile)` — the product's own value wins
  when set (including an explicit `NONE`, which is how you exempt one product from its
  category's profile); otherwise it inherits the category's; otherwise `NONE`.
- `findMissingComplianceFields(profile, complianceData)` — required fields that are absent or
  whitespace-only.

## Where it's enforced

| Place | Behaviour |
|---|---|
| `POST /api/admin/products`, `PUT /api/admin/products/:id`, `PATCH /:id/status` | All three route through one gate (`assertCompliantForActive`). Setting a product `ACTIVE` with missing fields returns **400 `COMPLIANCE_INCOMPLETE`** listing the missing field *labels*. `DRAFT`/`ARCHIVED` are never blocked — half-finished compliance data is what a draft is for. |
| Store Health (`backend/src/services/storeHealth.ts`) | The `product_compliance_complete` check flags any **already-live** product with unmet requirements. It's `critical`, so it caps the overall score at 59 exactly like unconfigured payments or shipping. This exists because the publish gate can be outflanked in one direction: assigning a profile to a category retroactively puts every product already live in it out of compliance. |
| Admin product editor | A *Compliance* card renders inputs generated from the registry for the resolved profile, with live resolution as you change category or profile. |
| Admin category editor | A compliance-profile picker. |
| Storefront product page | A disclosure block rendering whatever `complianceData` keys are populated, with their labels. Only shown when a profile applies. Carries `data-theme-section="product-compliance"` so themes can restyle it. |
| Setup Assistant | `get_compliance_requirements(profile?)` returns the field list. The prompt tells it never to invent compliance text — a fabricated ingredient list or safety warning is worse than a missing one. |

The admin UI reads the registry over `GET /api/admin/compliance-profiles` rather than keeping a
second copy of the field list in the frontend.

## The profiles as shipped

| Profile | Required fields |
|---|---|
| `NONE` | — |
| `COSMETICS` | INCI Ingredients · Net Quantity · Usage Warnings · Responsible Person (name + EU address) |
| `ELECTRONICS` | CE Marking Confirmed · Voltage/Power Rating · WEEE Registration Number |
| `TOYS_CHILDREN` | Minimum Age · CE Marking Confirmed · Choking Hazard Warning Text |
| `FOOD_CONTACT` | Food-Contact Material Declaration |
| `TEXTILE` | Fiber Composition · Care Instructions |

## Adding a new profile

Two files, then nothing else:

1. **`backend/prisma/schema.prisma`** — add the value to the `ComplianceProfile` enum, and
   generate a migration *offline*:
   ```bash
   # from backend/, with a copy of the pre-edit schema saved somewhere
   npx prisma migrate diff \
     --from-schema-datamodel /tmp/schema-before.prisma \
     --to-schema-datamodel prisma/schema.prisma \
     --script > prisma/migrations/<UTC-timestamp>_add_<name>_profile/migration.sql
   npx prisma generate
   ```
2. **`backend/src/lib/complianceProfiles.ts`** — add an entry to `COMPLIANCE_PROFILES` with a
   label, a one-line description, and the field list. Mark long-form fields `multiline: true`
   so the admin editor renders a textarea.

The admin editors, the publish gate, the Store Health check, the storefront block and the
assistant tool all pick it up with no further changes. The zod enums in
`routes/admin/products.ts` and `routes/admin/categories.ts` list the profile values explicitly
and do need the new value added — that's the one place a compiler won't catch for you.

## Adding a field to an existing profile

Just add it to that profile's `fields` array. Note the consequence: every product already live
in that profile immediately becomes non-compliant and will be flagged as a critical Store
Health failure until the field is filled in. That's intentional — it's the same situation as a
regulator adding a new disclosure duty — but do it deliberately, not by accident.

## Storage

`Product.complianceData` is a JSON column, not a set of typed columns. That's what lets one
schema serve a cosmetics store and an electronics store without either carrying the other's
dead columns. The trade-off is no database-level typing — the registry is the contract, and
validation lives in `findMissingComplianceFields`.

## Known gaps

- **Field labels are English only.** The storefront section *heading* is translated into all
  five locales, but the individual field labels come from the server registry in English. A
  proper fix means either localised labels in the registry or next-intl keys derived from the
  field keys.
- **Presence, not correctness.** "CE Marking Confirmed" is satisfied by any non-empty string.
