# Arminius

A mobile-first fitness and nutrition platform foundation built with React, TypeScript, Vite, and Supabase. This v0.1 is a reviewable starting point: it includes a polished preview shell and secure database structure, not completed workout or nutrition logging.

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

1. Create a Supabase project. Apply both files in `supabase/migrations/` in filename order through the SQL editor, or use the Supabase CLI (`supabase init`, `supabase link --project-ref YOUR_REF`, `supabase db push`). Never reapply a migration that already succeeded.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env.local`. A legacy public anon key also works. Only these public browser values belong in Vite variables. **Never expose service-role keys, secret keys, database passwords, or AI provider keys in a `VITE_` variable.**
3. In Auth settings, enable email/password sign-in and email confirmation. Set the site URL to the app origin, and allow the exact `/auth` redirect URL for localhost and your deployment (e.g. `http://localhost:5173/auth`). Use the same hostname when opening the app. Configure production SMTP before launch.
4. Restart Vite. Configured mode protects all application routes and exposes sign-up, sign-in, session restoration, sign-out, reset-email, and recovery password-update scaffolding at `/auth`.
5. Test two real accounts in separate browser profiles. Confirm emails, reload a signed-in session, reset a password, and sign out. This requires your Supabase project; the included engine tests do not replace hosted Auth integration testing.

The new-user trigger creates a profile and private leaderboard settings. Existing Auth users are backfilled during migration. The SQL schema is the source of truth; generate Supabase TypeScript types when adding data queries:

```sh
supabase gen types typescript --project-id YOUR_REF > src/lib/database.types.ts
```

Pass the generated `Database` type to `createClient<Database>` when persistence is introduced. No feature data queries are implemented yet.

## Architecture

- `src/App.tsx`: route protection, accessible shell, bottom navigation, not-found page.
- `src/auth/`: Auth lifecycle and account forms with error/loading feedback.
- `src/pages/Pages.tsx`: Home, Workout, Nutrition, Progress, Profile placeholders.
- `src/components/`: sample targets, private leaderboard placeholder, SVG muscle map.
- `src/data/exercises.json`: canonical starter exercise mappings. IDs match SQL and SVG regions.
- `supabase/migrations/`: schema, ownership policies, starter exercise catalog.
- `tests/`: PostgreSQL policy/constraint tests, deterministic mapping tests, mobile/desktop browser checks.

The SVG architecture separates typed muscle IDs, front/back path geometry, involvement aggregation, and rendering. Fixed weights (`1` primary; lower values supporting) are illustrative editorial mappings, **not measured activation, fatigue, or recovery**. Selection uses stable IDs and maximum involvement, independent of order/duplicates. Each muscle has a text equivalent; color is supplementary. Both views share stable muscle IDs and unique accessible SVG titles. The initial five exercises are a starter catalog, not a complete training library.

`node scripts/generate-catalog.mjs` reproduces the initial catalog migration from JSON. Once that migration is deployed, introduce catalog changes in a **new migration**, never rewrite migration history. A test checks JSON/SQL mapping parity.

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

All 18 tables have RLS and explicit grants. Anonymous database access is denied. Composite foreign keys enforce ownership across goals/targets, workouts/exercises/sets, meals/items, and AI requests/recommendations, including updates. Quantities have checks and explicit canonical units (kg, g, cm, m, seconds, kcal); dates use PostgreSQL timestamptz. Meal items snapshot consumed-portion nutrients rather than relying on mutable food entries.

No public leaderboard view exists. Opting in does not expose private profiles or raw activity. Add a server-owned, consent-filtered ranking projection with verified scores before implementing sharing. Awards, personal records, AI requests/results, and catalogs cannot be forged by browser clients. A future authenticated server/Edge Function must validate ownership, rate-limit AI jobs, and use trusted credentials only on the server. AI functionality is not connected in this release.

Tests execute the actual migrations in PGlite (PostgreSQL) with minimal `auth.users`, `auth.uid()`, and Supabase role shims. They verify account provisioning, grants, RLS visibility, cross-account references, owner CRUD, ownership changes, invalid data, cascade deletion, and catalog parity. Run equivalent checks against a staging Supabase project before production use.

## Deployment and next steps

Build with `npm run build` and serve `dist/` over HTTPS. Configure your host to rewrite non-asset routes to `index.html` so direct links to `/workout` and `/auth` work. Add the production Auth callback URL and public environment values to the host before building. No deployment is included in this PR.

Next milestones: verify hosted Auth and RLS with two accounts, generate database types, implement persistent workout logging, meal search/logging, goal editing and metrics, then consent-based rankings and server-side AI. PWA/offline support, custom foods, full exercise taxonomy, telemetry, and production operations are future work.

Reference documentation: [Vite setup](https://vite.dev/guide/), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Auth profile management](https://supabase.com/docs/guides/auth/managing-user-data).
