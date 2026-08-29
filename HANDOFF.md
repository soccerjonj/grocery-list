# Handoff — Our Pantry

Written for a fresh session picking up this codebase. It covers what exists, the
conventions you must follow, the traps that have already bitten, and what's left.

---

## 1. Read this first

- **`AGENTS.md` is binding.** This is Next.js **16** — APIs differ from most training
  data. Read the relevant guide in `node_modules/next/dist/docs/` before writing App
  Router code.
- **Build is `npm run build` = `next build --webpack`.** NOT turbopack — the PWA plugin
  requires webpack. `npx next build --turbopack` will produce misleading results.
- **There are no tests anywhere.** Every change needs manual verification, and for pure
  functions it's worth writing a throwaway node script to check behaviour (see §6).
- Verify with `npx tsc --noEmit` **and** a real build before committing.

### The environment trap that has cost hours

The repo lives in `~/Documents`, which is **iCloud-synced**. The sync corrupts
`node_modules` mid-build and creates ` 2.js`-style duplicate files. This has caused
**four** spurious build failures presenting as unrelated errors:

```
MODULE_NOT_FOUND … node_modules/lodash/_Symbol.js
TypeError: (0, _stacktraceparser.parse) is not a function
⨯ Failed to load next.config.ts
```

**If a build fails with a module error you can't explain, this is why.** Fix:

```bash
rm -rf node_modules .next && npm install && npm run build
```

The durable fix (not yet done, needs the user): exclude `node_modules` from iCloud sync,
or move the repo out of `~/Documents`.

---

## 2. Current state

Everything through **`91ece04`** is shipped to `main` and deployed via Vercel.

The recipes feature was built in 4 phases, then 3 follow-up batches:

| Commit | What |
|---|---|
| `2f09123` | Phase 1 — library: `/recipes` route, nav tab, list/detail/editor, shopping picker |
| `dd25cf0` | Phase 2 — guided cook mode, wake lock, cook history table, per-person ratings |
| `8c23846` | Phase 3 — pantry loop: availability, add-missing, confirm-then-deduct |
| `76cfca3` | Phase 4 — rich imports (steps/times/image), photo upload, "what can I cook?" |
| `0fb4f02` | Batch A — Title Case app-wide, cook-checklist clarity |
| `52f10db` | Batch B — ingredient parsing fixes, staples, aliases, ingredient sheet, "Part of" |
| `91ece04` | Batch C — step timers, prep/cook session timing, cook history read path |

### ⚠️ Migrations that may be unapplied

`030_staples_aliases.sql` and `031_cook_durations.sql` were the last two. **Confirm with
the user before debugging anything recipe-related** — a missing migration presents as a
feature silently doing nothing.

Applied with `supabase db push` (or pasting the SQL into the Supabase SQL editor). Note
migrations have been applied **out of order before**: `027` was skipped for a while and
only surfaced when `028` failed with `relation "household_taxonomy" does not exist`.
Don't assume the DB matches the repo.

---

## 3. Architecture you must know

### Data access
- **`HouseholdDataContext`** lifts five hooks so they survive tab switches: `pantry`,
  `shopping`, `members`, `recipes`, `taxonomy`. Consume via `useHouseholdData()` — do
  **not** call those hooks directly in components.
- Anything household-scoped that needs realtime must have a **`household_id` column on
  the row itself** and **`REPLICA IDENTITY FULL`** (migration 025). Realtime evaluates
  RLS against the WAL image; without both, UPDATE/DELETE events are silently dropped.
  This was a real bug — see §6.
- Each realtime hook uses a **unique channel name per instance**
  (`` `topic-${id}-${randomSuffix}` ``). Two consumers sharing a topic caused a hard
  crash. Copy this pattern.

### The matching layer (critical to get right)
- **`normalizeItemName()`** (`src/lib/normalizeItemName.ts`) is *the* key function for
  "are these the same item". Accent-folds, lowercases, collapses whitespace, singularizes
  the last word. Conservative by design.
- Because it **lowercases internally**, display casing is always safe — it can never
  affect dedup or availability.
- **`indexPantryRows()`** (`src/lib/checkPantryDuplicate.ts`) builds
  `Map<normalizedName, PantryIndexEntry>`. `useRecipeAvailability` indexes the in-memory
  pantry with it — **never query per recipe**, that would be 200 round-trips on the
  recipes list.

### `household_taxonomy` — the extensible pattern
One table backs every household-defined list, via widened CHECK constraints:

| type | kind | meaning |
|---|---|---|
| `category` / `location` | `food` / `supplies` | custom pantry pills (027) |
| `recipe_tag` | `recipe` | recipe tags (028) |
| `staple` | `ingredient` | assumed always on hand (030) |
| `ingredient_alias` | `ingredient` | `label` → `target` pantry item (030) |
| `recipe_part` | `recipe` | custom "Part of" sections (030) |

Adding a new list = widen both CHECKs + extend the `TaxonomyType` union. You inherit RLS,
realtime, and case-insensitive uniqueness free. **Gotcha:** the table dedupes on
`lower(label)`, *not* `normalizeItemName` — any read path that must line up with the
pantry index has to re-key through `normalizeItemName`.

### Recipes data model
- `household_recipes` — `ingredients` and `steps` are **JSONB**, so adding optional
  fields to a row shape needs **no migration**.
- `recipe_cooks` — one row per cook (+ durations from 031). A trigger keeps
  `cook_count`/`last_cooked_at` on the recipe in sync.
- `recipe_ratings` — per-person, with **split RLS** (read all, write only your own).
- `recipeIngredientList()` / `recipeStepList()` in `src/lib/recipeTypes.ts` are the
  **single read path** behind every display *including the editor*. Casing is normalized
  there, which makes it self-healing — what you see is what saves.

### UI conventions
- Page shell: `max-w-lg lg:max-w-5xl mx-auto px-4 lg:px-8 pt-6 pb-24 lg:pb-12`.
- Mobile header action clusters must be `lg:hidden` — they duplicate the desktop sidebar.
- **`ItemSheet`** (`variant: "sheet" | "rail"`) is the shared bottom-sheet/desktop-rail
  primitive. Use it rather than hand-rolling a portal.
- **`BottomNav.tsx` and `Sidebar.tsx` have duplicated tab arrays** — a nav change means
  editing both, and they must use *different* framer `layoutId`s.
- Toasts: `useToast()` → `success` / `error` / `withAction` (undo).

---

## 4. Non-obvious decisions (don't "fix" these)

- **No mass↔volume unit conversion** (`src/lib/unitConvert.ts`). Converting cups→grams
  needs per-ingredient density. Unmatched units report `unknown` and show both amounts
  rather than asserting a wrong answer.
- **Availability is presence-based.** A pantry "2 bags" vs recipe "3 cups" is genuinely
  unanswerable; we say so instead of guessing.
- **Nothing is deducted silently.** The post-cook sheet starts ambiguous rows at zero and
  *off*. The cook is recorded **last**, so a failed pantry write can't leave history
  claiming a deduction that didn't happen.
- **Cook timing is derived from wall-clock anchors, never ticked.** Mobile throttles
  background timers hard and you're backgrounded constantly while cooking.
- **Step timers require an explicit unit**, take the **lower** bound of a range, and only
  offer the *first* duration in a step. "Preheat to 350" must never become a timer.
- **"Usually takes" uses the median**, not the mean, and states its sample count.
- **Prep/cook split only exists if the user tapped "Prep done"** — otherwise one honest
  total. No heuristic guesses which step stops being prep.
- **Staples get their own grey state**, not green — green would claim we verified stock
  we haven't.
- The common-staples set is **offered, never auto-applied**.

---

## 5. Open work

**Before launch**
- Placeholder legal copy in `src/app/privacy/page.tsx` and `src/app/terms/page.tsx`.
- `FEEDBACK_EMAIL` in `src/lib/appVersion.ts` is a placeholder.
- Optional: full CSP with nonces (currently only `frame-ancestors 'none'` — a strict
  `script-src` needs per-request nonces or it white-screens the app).

**Known deviations from the approved plan**
- Batch A shipped **without** a "Skip" link on the cook checklist — the footer's "Start
  cooking" already does it, and two controls for one action recreates the confusion the
  change was fixing. Revisit if the user disagrees.

**Unresolved**
- A blank-screen incident after Batch A/B was never root-caused; it resolved on its own.
  Local build, SSR, and a real browser load were all verified clean, and the PWA already
  defaults `skipWaiting`/`clientsClaim` to true. **If it recurs, get the browser console
  error first** — that identified the two previous crashes instantly.

---

## 6. Bugs already found and fixed — don't reintroduce

| Symptom | Cause |
|---|---|
| Check-offs not syncing between phones | Missing `REPLICA IDENTITY FULL`; realtime couldn't run RLS on UPDATE, so it dropped the events. INSERTs worked, which made it look random. |
| Whole app crashed, blank page | Two `useActivityLog` instances shared one realtime channel topic; the second `.on()` after `.subscribe()` throws. |
| React error #310 | `useIsDesktop()` called *after* an `if (loading) return` — hook count changed between renders. **Call every hook before any early return.** |
| Bought items reappearing on the list | Import "Skip" re-homed the row to the active list as uncompleted. |
| `+` button off-screen | Flex child without `min-w-0` can't shrink below its content width. |
| Ingredients never matching the pantry | `"soy sauce, for marinade"` stored as the *name*. Also: any word after a number was taken as a unit ("2 chicken breasts" → "breasts"), and prep notes weren't stripped on the regex path. |

**Two parse chokepoints** must both be updated when changing ingredient handling:
`coerceItem()` in `src/app/api/extract-recipe/route.ts` (LLM paths) and
`parseIngredientLine()` in `src/lib/recipeExtract.ts` (**the JSON-LD regex fast path,
which is the most common URL import and never reaches the model**). Fixing only the prompt
misses the majority of real imports.

`src/lib/recipeExtract.ts` has a **module-private `normalizeUnit`** that emits capitalized
`"mL"`/`"L"`, distinct from the exported lowercase one in `normalizeItemName.ts`. Don't
conflate them.

### Verifying pure functions without a test runner
There's no test setup, so behaviour-check parsers with a throwaway script — this caught
several regex bugs in `parseStepDuration`:

```bash
# crude TS-strip + assert a table of real inputs; see git history for the pattern
node /tmp/t.mjs
```

Always include the **negative** cases ("preheat to 350" → no timer).

---

## 7. Useful commands

```bash
npm run dev                 # dev server (NOTE: service worker is disabled in dev)
npm run build               # production build — webpack, required for PWA
npx tsc --noEmit            # type check
supabase db push            # apply pending migrations
```

Notification and service-worker behaviour **cannot be tested with `next dev`**
(`disable: NODE_ENV === "development"` in `next.config.ts`) — use a production build, and
on iPhone the PWA must be installed to the Home Screen for web push.
