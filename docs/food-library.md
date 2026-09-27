# Food library and meal workflow

Arminius stores a compact USDA catalog in the existing Supabase database. Searches query that catalog without paid food-provider or AI calls.

## Source decision

| Source | Fit | Cost and conditions | Decision |
| --- | --- | --- | --- |
| USDA FoodData Central | Ingredients, preparation-specific foods, nutrients, portions; separate branded datasets | Public-domain/CC0 data. Bulk downloads need no API key. Optional API requires a private key and has rate limits. | Use a pinned Foundation download. |
| Open Food Facts | Community-maintained packaged products and barcodes | ODbL attribution/share-alike terms and endpoint rate limits. Combining databases affects licensing. | Defer until barcode coverage and data boundaries are designed. |
| AI-generated nutrient numbers | Can sound plausible without matching a food or portion | Inference costs and unverifiable numbers | Do not use as the nutrition source. Future AI should propose sourced matches for review. |

References: [USDA API/licensing](https://fdc.nal.usda.gov/api-guide/), [USDA downloads](https://fdc.nal.usda.gov/download-datasets/), [Open Food Facts conditions](https://support.openfoodfacts.org/help/en-gb/12-donnees-api/94-y-a-t-il-des-conditions-pour-utiliser-l-api).

## Data

The April 30, 2026 Foundation release supplies **311 foods** with energy and all three macros. The archive contains 395 entries; 84 empty/incomplete entries were omitted. Unknown nutrients stay null.

`data/usda-foundation.json` records the source URL, archive SHA256, release, license, and normalized foods. Attribution: U.S. Department of Agriculture, Agricultural Research Service, FoodData Central. Data is CC0-1.0.

Values are per 100 grams. Nutrient IDs map protein, fat, carbohydrate, fiber, total sugars, saturated fat, sodium, potassium, and kcal energy. Energy uses 1008 when present, otherwise specific/general Atwater energy (2048/2047); it is not replaced with a locally calculated macro total. Source-provided portions include gram weights. RACC is displayed as a USDA reference portion, not a personalized recommendation. Raw/cooked descriptions remain explicit.

This is a starter ingredient catalog, not complete branded-product or barcode coverage. Label entry supports missing foods.

## Workflow and ownership

Nutrition → Add food supports search, favorites, and recent foods. Review grams or a source serving, add up to 50 foods, then save a meal. Custom labels require calories/macros for the entire portion; optional values can stay blank.

Recent meals displays the latest 30 entries with edit, confirmed delete, and reuse. Reuse opens a draft for review. Drafts survive navigation/reload in the current tab and are scoped to the account; closing the tab clears session storage.

The database derives new catalog entries' nutrients and stores snapshots. Portion edits and reuse scale saved snapshots, preserving provenance even after catalog changes. Custom labels are not described as USDA data. Each save is atomic; retries with the same operation ID do not duplicate meals. Stale revisions cannot overwrite or delete newer edits. RLS restricts meals and favorites to their owners.

## Maintenance and cost

`python scripts/import-usda.py` downloads and normalizes the pinned archive, or accepts a local ZIP path for offline use. It has no database credentials or database writes. Its manual GitHub workflow has read-only permissions, a three-minute timeout, and no schedule.

`node scripts/generate-food-catalog.mjs` prints a SQL snapshot. Review changes and create a **new migration** for each future catalog update; never rewrite applied migrations. Stable IDs preserve references; old meal snapshots remain unchanged.

No paid food API, AI model, scheduled worker, new project, or subscription is added. Existing database and GitHub Actions usage still count against plan allowances. Full branded coverage needs a storage/freshness plan first.

## Validation and limits

Database tests execute the migrations with multiple roles, testing derived values, snapshots, invalid partial saves, stale edits, retries, pagination, and private favorites. Phone/desktop browser tests cover search, portions, favorites, retained drafts, multi-food saving, editing, reuse, and deletion against a fake backend. Live schema/catalog checks are separate; real-account end-to-end checks remain before public launch.

Dedicated saved recipes with serving yields, barcode lookup, natural-language entry, and AI nutrition readouts remain future work. Future AI entry should require review before saving and have explicit request/token/spending limits.
