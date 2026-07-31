# Our Pantry

A shared pantry and shopping-list app for households. Track what you have, what's
running low, and what to buy — synced in real time across everyone's phones. Built
as an installable, offline-capable PWA.

> Personal/household project. Not affiliated with any store or brand.

## Features

- **Shared households** — invite members with a code; everyone sees the same pantry
  and shopping list, updated live via Supabase Realtime.
- **Pantry tracking** — quantities, units, storage locations, categories, per-member
  assignment, notes, and expiry with an at-a-glance freshness signal ("Use soon",
  "Running low").
- **Custom categories & locations** — households can add their own pantry categories
  and storage locations that persist as reusable pills.
- **Smart shopping flow** — add items (typed, bulk paste, or voice), group by store or
  aisle, check off as you shop, then finish a trip and import what you bought straight
  into the pantry (with duplicate-aware restock/merge).
- **Barcode scanning** — look up products via OpenFoodFacts to pre-fill an item.
- **Recipe import** — paste a recipe URL or photograph a recipe card; ingredients are
  extracted (JSON-LD first, Claude as fallback) and added to the list. Save recipes to
  reuse them.
- **Receipt import** — photograph a grocery receipt to bulk-add items (Claude vision).
- **AI categorization** — unknown items are classified into a shared cache.
- **Account & household management** — profiles/colors, theme, password change, data
  export, transfer/leave/delete household, and account deletion.
- **Desktop layout** — a responsive sidebar, master–detail editor rail, and dashboard
  at wider breakpoints, without changing the mobile experience.

## Tech stack

- **Framework:** Next.js 16 (App Router) · React 19 · TypeScript
- **Styling:** Tailwind CSS v4 · Framer Motion · next-themes (light/dark)
- **Backend:** Supabase — Postgres, Row-Level Security, Auth, Realtime
- **AI:** Anthropic Claude (Haiku for classification/URL extraction, Sonnet for vision)
- **PWA:** `@ducanh2912/next-pwa` (service worker, installable, offline shell)
- **Other:** `@zxing/browser` (barcode), OpenFoodFacts API

## Getting started

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project
- An [Anthropic API key](https://console.anthropic.com) (for recipe/receipt/AI features)
- The [Supabase CLI](https://supabase.com/docs/guides/cli) (to apply migrations)

### 1. Install

```bash
npm install
```

### 2. Environment

Create `.env.local` in the project root:

```bash
# Supabase (Project Settings → API)
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # server-only; never exposed to the client

# Anthropic (recipe/receipt extraction + item classification)
ANTHROPIC_API_KEY=your-anthropic-key

# Optional: read-only shopping-list JSON endpoint (/api/v1/shopping)
DASHBOARD_API_TOKEN=a-long-random-token
DASHBOARD_HOUSEHOLD_ID=the-household-uuid
```

> The `anon` key is public by design (it ships in the client). The `service_role` key
> is server-only — keep it out of any `NEXT_PUBLIC_` variable.

### 3. Database

Apply the migrations in `supabase/migrations/` to your project:

```bash
supabase link --project-ref YOUR-PROJECT-REF
supabase db push
```

### 4. Run

```bash
npm run dev
```

Open http://localhost:3000.

## Scripts

| Script          | Description                                              |
| --------------- | ------------------------------------------------------- |
| `npm run dev`   | Start the dev server                                    |
| `npm run build` | Production build (uses the webpack builder for the PWA) |
| `npm start`     | Serve the production build                               |

## Project structure

```
src/
  app/                 # Next.js App Router routes
    api/               # Route handlers (recipe/receipt extract, classify, account)
    household/[id]/     # Pantry, shopping, dashboard, settings (per household)
    auth/              # Sign up / log in / callback
  components/          # UI, pantry, shopping, household, dashboard components
  hooks/               # Data hooks (pantry, shopping, members, recipes, taxonomy, …)
  context/             # HouseholdDataProvider, toasts, theme
  lib/                 # Supabase clients, helpers (expiry, dedup, SSRF guard, …)
supabase/migrations/   # SQL schema, RLS policies, and RPCs
.github/workflows/     # CI (Supabase keepalive)
```

## Deployment

- **Frontend:** deploy on [Vercel](https://vercel.com). Set the same environment
  variables in the project settings.
- **Database:** the Supabase project (migrations applied via `supabase db push`).

### Keeping Supabase awake

Free-tier Supabase projects pause after 7 days of inactivity. The
`.github/workflows/supabase-keepalive.yml` Action pings the database every two days to
keep it active. It needs two repository secrets: `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

## Security

Tenant isolation is enforced by Postgres Row-Level Security; privileged household
operations go through owner-checked `SECURITY DEFINER` RPCs. The server-fetch used by
recipe URL import is guarded against SSRF, and the AI routes are rate-limited. See the
migrations in `supabase/migrations/` for the policies and functions.

## License

Private project — all rights reserved.
