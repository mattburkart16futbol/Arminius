# Arminius metrics and leaderboard package review

Integrated on `codex/social-metrics`, preserving the existing workout engine and migrations 001–007.

## Delivered

- Nutrition: consumed-portion food entries, curated-catalog search, nullable micronutrients, daily minimum/maximum/target settings, 7/30/90-day metrics, macro split, adherence, and nutrient coverage.
- Profile: dated bodyweight entries, public alias, aggregate opt-in, separate explicit named-score consent, and friend requests/accept/decline/remove.
- Progress: bodyweight-relative ratios and platform/friend percentiles with consistent eligible exercise rules.
- Leaderboards: ten benchmarks, Friends/Platform, absolute/relative/growth, Top 25/100/500, machine caveats, and per-dumbbell labeling.
- Home: one aggregate trending card; existing five-tab navigation retained.

## Problems corrected in the supplied package

1. Its migration numbers collided with deployed 006/007. New work is numbered 008–011; old SQL and the working logger were preserved.
2. Its score functions disagreed on weighted pull-ups and included ineligible assisted movements. Scoring now shares one formula; weighted pull-ups require recent bodyweight and include it in effective load.
3. Scores refreshed only when each athlete visited the page, and growth could become stale. Private invalidation triggers and expiry now refresh eligible dirty accounts on comparison reads.
4. Ties were broken by alias inside the ranking function. Equal scores now receive equal ranks.
5. Same-time sessions could duplicate growth rows. Session IDs provide deterministic ordering and one result per lift.
6. Nutrition and bodyweight queries silently truncated records; competing responses could overwrite newer selections. Reads now paginate with stable ordering and reject stale responses.
7. Nutrition coverage weighted each day equally despite describing item coverage. It now weights actual logged items; unknown nutrients remain unknown.
8. Aggregate consent was silently reused for named score publication. A separate checkbox explains that absolute + relative scores may reveal approximate bodyweight, as requested.
9. Single-person cohorts and raw custom food names undermined privacy. Percentiles need five peers; trending entries need three opted-in athletes and use catalog food names only.
10. The package had analytics but no input screens. Meal/target/bodyweight entry was added so the feature can be used without editing database tables.

## Validation and limits

All migrations execute locally in PostgreSQL/PGlite. Tests cover ownership, grants, private helper access, score forgery, opt-out, named consent, friendship authorization, ties, growth, weighted pull-up and bodyweight refresh, finite nutrition data, atomic snapshots, and unknown nutrients. Browser scenarios exercise nutrition saving/targets, bodyweight, consent, benchmark controls, and the existing workout flow with an isolated fake backend. Screens were reviewed at phone width.

Migrations 008–011 were applied to the hosted Arminius Supabase project on September 26, 2026. The live schema has all 23 public tables with RLS enabled and ten seeded benchmark lifts. Migration 012 removes API execution rights from the dashboard's internal automatic-RLS event trigger. Real-account checks of the hosted app remain to be completed.

Food search uses your curated catalog, which this update does not seed. Manual food entries work; they intentionally do not enter public food trends. Meal editing/deletion and multi-item composition remain future work. Scores derive from self-reported logs and are not independently verified. Minimum group sizes reduce small-group exposure but do not constitute a formal anonymity guarantee. No paid APIs, scheduled workers, subscriptions, or deployments were enabled.

