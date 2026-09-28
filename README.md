# Arminius

A mobile-first fitness and nutrition platform foundation built with React, TypeScript, Vite, and Supabase. The foundation now includes persistent workout logging, a 300-exercise catalog, deterministic progress analytics, and an interactive muscle heatmap. Nutrition entries/metrics, bodyweight tracking, private percentiles, opt-in benchmark boards, and community trends are now implemented. Home targets remain labeled samples.

## Run locally

Requires Node.js 22.12+ (Node 22 LTS recommended) and npm.

```sh
npm install
cp .env.example .env.local
npm run dev
```

Open the local URL printed by Vite. Empty environment values enable a clearly labeled preview mode: all five routes work without a backend, sample targets are explicitly labeled, and nothing is persisted. On Windows PowerShell use `Copy-Item .env.example .env.local`.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run preview
# Browser checks (once per machine, install Chromium):
npx playwright install chromium
npm run test:e2e
```

`npm run check` runs lint, PostgreSQL/mapping tests, typecheck, and production build. Commit the lockfile; CI uses `npm ci`.

## Connect Supabase

1. Create a Supabase project. Apply all files in `supabase/migrations/` in filename order through the SQL editor, or use the Supabase CLI (`supabase init`, `supabase link --project-ref YOUR_REF`, `supabase db push`). Never reapply a migration that already succeeded.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env.local`. A legacy public anon key also works. Only these public browser values belong in Vite variables. **Never expose service-role keys, secret keys, database passwords, or AI provider keys in a `VITE_` variable.**
3. In Auth settings, enable email/password sign-in and email confirmation. Set the site URL to the app origin, and allow the exact `/auth` redirect URL for localhost and your deployment (e.g. `http://localhost:5173/auth`). Use the same hostname when opening the app. Configure production SMTP before launch.
4. Restart Vite. Configured mode protects all application routes and exposes sign-up, sign-in, session restoration, sign-out, reset-email, and recovery password-update scaffolding at `/auth`.
5. Test two real accounts in separate browser profiles. Confirm emails, reload a signed-in session, reset a password, and sign out. This requires your Supabase project; the included engine tests do not replace hosted Auth integration testing.

The new-user trigger creates a profile and private leaderboard settings. Existing Auth users are backfilled during migration. The SQL schema is the source of truth; generate Supabase TypeScript types when adding data queries:

```sh
supabase gen types typescript --project-id YOUR_REF > src/lib/database.types.ts
```

The current client uses explicit row and RPC response types in `src/lib/workout-api.ts`; generated database types remain a follow-up. Workout reads and saves are implemented.

## Architecture

- `src/App.tsx`: route protection, accessible shell, bottom navigation, not-found page.
- `src/auth/`: Auth lifecycle and account forms with error/loading feedback.
- `src/pages/Pages.tsx`: Home, Nutrition, Profile.
- `src/pages/WorkoutPage.tsx`: compact workout editor, save/retry, rest timer, history.
- `src/pages/ProgressPage.tsx`: completed-workout analytics and interactive heatmap.
- `src/components/`: sample targets, private leaderboard placeholder, SVG muscle map.
- `src/data/exercises.json`: canonical 300-exercise mappings. IDs match SQL and SVG regions.
- `supabase/migrations/`: schema, ownership policies, starter exercise catalog.
- `tests/`: PostgreSQL policy/constraint tests, deterministic mapping tests, mobile/desktop browser checks.

The SVG architecture separates typed muscle IDs, front/back path geometry, involvement aggregation, and rendering. Fixed weights (`1` primary; lower values supporting) are illustrative editorial mappings, **not measured activation, fatigue, or recovery**. Selection uses stable IDs and maximum involvement, independent of order/duplicates. Each muscle has a text equivalent; color is supplementary. Both views share stable muscle IDs and unique accessible SVG titles. The catalog contains 300 editorially selected movements from the supplied package, not a statistically ranked list of the most popular lifts. Tracking modes and load conventions live in `src/data/exercise-tracking.json`.

`node scripts/generate-catalog.mjs` prints a catalog SQL snapshot to stdout for inspection; it never overwrites migration files. Once that migration is deployed, introduce catalog changes in a **new migration**, never rewrite migration history. A test checks JSON/SQL mapping parity.

## Data and security boundaries

| Area             | Tables                                           | Browser access                                                  |
| ---------------- | ------------------------------------------------ | --------------------------------------------------------------- |
| Account          | profiles                                         | Read/update own allowed profile fields; created by Auth trigger |
| Goals            | goals, targets                                   | Own records only                                                |
| Training         | workouts, workout_exercises, sets                | Own records only                                                |
| Nutrition        | meals, meal_items                                | Own records only                                                |
| Measurements     | body_metrics                                     | Own records only                                                |
| Catalogs         | exercises, exercise_muscles, foods, achievements | Authenticated read; trusted writes                              |
| Verified results | user_achievements, personal_records              | Read own; trusted writes                                        |
| Sharing          | leaderboard_settings                             | Own settings only; opt-in defaults false                        |
| AI               | ai_requests, recommendations                     | Read own; trusted writes                                        |

All 24 tables have RLS and explicit grants. Anonymous database access is denied. Composite foreign keys enforce ownership across goals/targets, workouts/exercises/sets, meals/items, and AI requests/recommendations, including updates. Quantities have checks and explicit canonical units (kg, g, cm, m, seconds, kcal); dates use PostgreSQL timestamptz. Meal items snapshot consumed-portion nutrients rather than relying on mutable food entries.

Cross-user access is restricted to aggregate comparison/trending RPCs and explicitly opted-in named benchmark scores. Raw profiles, measurements, workouts, and meal items stay private. Browser clients cannot write derived score tables, friendships, or catalogs directly. Named consent discloses the bodyweight inference tradeoff. AI functionality is not connected.

Tests execute the actual migrations in PGlite (PostgreSQL) with minimal `auth.users`, `auth.uid()`, and Supabase role shims. They verify account provisioning, grants, RLS visibility, cross-account references, owner CRUD, ownership changes, invalid data, cascade deletion, and catalog parity. Run equivalent checks against a staging Supabase project before production use.

## Deployment and next steps

Build with `npm run build` and serve `dist/` over HTTPS. Configure your host to rewrite non-asset routes to `index.html` so direct links to `/workout` and `/auth` work. Add the production Auth callback URL and public environment values to the host before building. No deployment is included in this PR.

Next milestones: verify the hosted social/metrics update with real accounts, generate database types, connect Home targets to real data, expand the food catalog and meal editing, and add operational monitoring before a public launch. PWA/offline support and optional AI remain future work.

Reference documentation: [Vite setup](https://vite.dev/guide/), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Auth profile management](https://supabase.com/docs/guides/auth/managing-user-data).

## Workout update for an existing installation

If migrations 001 and 002 are already applied, apply only 003–007, in filename order. Do not rerun the foundation. Migration 005 stops with an explanation if an account has multiple active workouts; resolve those intentionally before continuing. The update adds RIR, expands the catalog while preserving existing exercise IDs, defines tracking conventions, and installs `save_workout`.

`save_workout` saves the complete editor snapshot in one PostgreSQL transaction with invoker security/RLS. A failed save rolls back; revision checks reject stale tabs; a request ID makes an unchanged retry idempotent. Finish saves current edits and requires at least one completed set. Empty draft rows may be saved. Completed sessions are read-only in this version. Direct REST clients remain governed by ownership policies, but should use the RPC for revision-aware edits.

Unsaved edits are retained in sessionStorage, scoped to the signed-in account and this tab. Matching server revisions can restore them after navigation/reload; a newer server revision wins. Closing the tab clears this recovery copy. This is not offline synchronization. Conflicts require reloading saved data, which intentionally discards stale local edits after confirmation.

## Logging and metric conventions

- Dumbbell inputs mean **each dumbbell**, with a visible label. Alternating movements use reps per side. Volume uses the logged individual load × reps; it is not silently doubled.
- Barbell/external load includes the bar. Bodyweight movements record added load only. Assisted movements record assistance, excluded from load-volume and heaviest-load rankings.
- Time/distance movements use seconds/metres. All stored weight uses kg; display may use lb. RPE and RIR are optional.
- Completed, non-warm-up sets in finished sessions drive analytics. Timed/distance sets count toward workload, but not rep volume. Repeated lifts produce one best e1RM point per session.
- e1RM uses Epley for eligible strength lifts and benchmarks with 1–12 reps. These are estimates, not verified rankings. Muscle maps use fixed editorial involvement weights, not recovery or physiological measurements.
- Progress shows the latest 250 sessions within 30/90/365 days and explicitly warns if capped. Child rows are paginated. Recent workout details and prefill cover the latest 20 sessions.
- The metrics/social extension below adds nutrition, bodyweight-relative scores, and opt-in comparisons. No paid service, deployment, subscription, or background job is added.

Tests include real SQL execution in PGlite and browser tests with a fake Supabase endpoint. Browser tests explicitly override local environment values, so they do not write to your hosted project. After applying SQL, manually start a workout, save a dumbbell set, reload, finish, check Progress, and verify another account cannot see it.

## Metrics and social update (008–012)

Apply 008 nutrition metrics, 009 strength percentiles/friends, 010 benchmarks/cache, 011 nutrition entry, and 012 internal RLS-trigger grant hardening **after** the existing 001–007 migrations. The supplied Chat package reused 006/007; its files have been renumbered to preserve deployed history. The old workout logger and save RPC remain intact. Migrations 008–012 are applied to the hosted Arminius project; do not replay them there.

Nutrition supports manual consumed-portion entries, search of your curated food catalog, daily targets, 7/30/90 local-calendar-day summaries, 4/4/9 macro shares, and item-weighted nutrient coverage. Missing optional nutrients remain unknown, and days without entries are not zero-intake days. Optional averages use only days with complete values for that nutrient. Current standalone daily targets are applied across the selected period; goal-linked targets are not included. The food-library extension below adds a sourced catalog, multiple foods per meal, editing, deletion, favorites, and reuse. No paid food API is connected.

Profile has bodyweight entry (kg/lb and measurement time), alias, aggregate participation, a separate named-score consent checkbox, and friend request/accept/decline/remove controls. Relative strength uses the most recent weight on/before the workout, at most 90 days old. No future weight is inferred. Progress ratios use the displayed date range; percentiles compare all-time bests. Percentiles require **five other eligible athletes**; smaller cohorts show their count but no percentile. Ties receive half credit. This is a minimum privacy threshold, not a formal differential-privacy guarantee.

Home has one community pulse card; /leaderboards holds ten benchmarks with Friends/Platform, absolute/relative/90-day-growth, and Top 25/100/500 controls. Named boards require both opt-ins. The explicit consent explains that publishing absolute and relative scores can allow inference of approximate bodyweight. Raw measurements and workout rows stay private. Opting out excludes a user immediately, regardless of cached scores. Users who only consent to aggregate participation do not appear by alias on boards.

Scores use completed non-warm-up sets of 1–12 reps, grouped to one best estimate per workout. Eligible strength lifts and the ten benchmarks share the same formula. Dumbbell scores mean one dumbbell. Weighted pull-ups use bodyweight plus added load. Machines carry the variability caveat. Dense ranks preserve ties; growth uses first and latest sessions in the trailing 90 days, requires two sessions, and uses workout IDs to break timestamp ties. These are **self-reported comparisons**, not independently verified achievements or population norms.

Private dirty-cache state is invalidated by workout, exercise, set, or bodyweight changes. Comparison reads refresh only dirty/expired eligible athletes; expiry handles the next 90-day boundary and has a daily fallback. No scheduled workers or paid model calls are added. For a large audience, batch refresh work and add abuse controls before scaling; this initial implementation may rebuild several opted-in athletes on a cold read.

Trending uses Monday 00:00 UTC through now, at least **three opted-in athletes per entry**, and unique-athlete counts before volume. Only catalog food names are public; private custom food labels never enter trending. Draft-only exercises and future activities are excluded. Friends rankings include the viewer only if they separately consented to named scores.

Security tests execute all migrations in PostgreSQL/PGlite with multiple simulated account roles. Browser tests use an isolated fake Supabase origin. Hosted application checks still require real authenticated accounts. No migrations are automatically applied by Vite or GitHub Actions.

## Food library and meal editing

The expanded hosted catalog contains 6,685 sourced foods: 5,742 generic and prepared foods from USDA Foundation and FNDDS, 899 branded products (the new 820-product USDA sample plus 79 earlier items retained for existing references), and 44 restaurant menu entries and components from Subway, Jimmy John's, Chick-fil-A, and Chipotle. The restaurant entries use official U.S. nutrition sources and retain serving-size weights. USDA alcohol records cover generic spirits and beer styles; the Heineken branded beer record also stores ethanol derived from its published ABV. Packaged products cover grocery brands, breads, beverages, and other foods, and retain UPCs where provided. Foods carry nutrient values keyed by USDA nutrient ID, including vitamins, minerals, cholesterol, fatty acids, and alcohol when present. Nutrition can be stated per 100 g, per 100 ml, or per complete restaurant serving; saved meals retain their quantity and unit alongside the nutrient snapshot. Source coverage, age, and collection rules are documented in [docs/food-library.md](docs/food-library.md).

Nutrition → Add food now supports search, labeled source portions in grams, milliliters, or servings, multiple foods, edit/delete, and reuse of recent meals. Drafts persist within the current browser tab, scoped to the account. Historical nutrient snapshots survive catalog changes. Search runs against Supabase, with no paid food API or AI requests.

The tracked `202609270003_usda_fndds_nutrients.sql` migration adds flexible nutrient snapshots and GTIN search; it has been applied to the hosted Arminius project. Migration `202609270005_food_measurement_units.sql` supports volume and whole-item portions, `202609270006_usda_branded_expansion.sql` adds the expanded branded sample, and `202609270007_restaurant_menu_seed.sql` adds the first official restaurant entries. The complete reproducible USDA seed migration is generated locally from pinned public USDA files to keep the larger snapshot out of GitHub. For a new database, apply tracked migrations in order, run the three import commands in the food-library guide, generate and apply the full seed, and do not replay already-applied migrations. See [food-library source selection, maintenance, and limits](docs/food-library.md). Reviewed natural-language meal entry remains a separate next step.

## Free workout text entry

The Workout page accepts explicit shorthand locally, without AI keys, model downloads, paid inference, or web search. Use one exercise per line, for example `Bench press: 135 lb x 10, 155 lb x 8` and `Dumbbell shoulder press: 3 sets of 10 at 40 lb`. Choose default units for unlabelled weights. Dumbbell loads always mean each dumbbell; bodyweight exercises accept `bodyweight x 10` or an added load.

Review the interpreted sets, start a workout if necessary, and select **Add draft sets to workout**. This appends editable drafts, never overwrites exercises or marks sets complete. Mark performed sets complete through the normal editor. Unsupported language, ambiguous names, warm-up/RPE annotations, timed/distance exercises, and assistance loads require correction or manual entry; nothing is silently dropped. This is a bounded parser, not conversational AI or coaching. Paid AI/search remain unconfigured until a later explicit launch decision; the $20 future budget is not an active subscription.
