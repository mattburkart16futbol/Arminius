# Food library and meal workflow

Arminius stores a compact USDA catalog in the existing Supabase database. Searches query that catalog without paid food-provider or AI calls.

## Source decision

| Source | Fit | Cost and conditions | Decision |
| --- | --- | --- | --- |
| USDA FoodData Central | Ingredients, prepared foods, portions, label nutrients, and GTINs in its separate data sets | Public-domain/CC0 data. Bulk downloads need no API key. The branded bulk archive is large. | Use pinned Foundation/FNDDS releases and a small, filtered branded sample. |
| Open Food Facts | Community-maintained packaged products and barcodes | ODbL attribution/share-alike terms and endpoint rate limits. Combining databases affects licensing. | Defer until barcode coverage and data boundaries are designed. |
| AI-generated nutrient numbers | Can sound plausible without matching a food or portion | Inference costs and unverifiable numbers | Do not use as the nutrition source. Future AI should propose sourced matches for review. |

References: [USDA API/licensing](https://fdc.nal.usda.gov/api-guide/), [USDA downloads](https://fdc.nal.usda.gov/download-datasets/), [Open Food Facts conditions](https://support.openfoodfacts.org/help/en-gb/12-donnees-api/94-y-a-t-il-des-conditions-pour-utiliser-l-api).

## Data

The catalog contains **6,333 sourced foods**: 5,742 generic and prepared foods (311 Foundation and 5,431 FNDDS 2021–2023 foods) and 591 branded products. The branded sample covers grocery, meat, dairy, pantry, snack, and sports-nutrition products with unique UPCs. It includes 17 UPCs retained from the original sample so this expansion preserves previously available products. Foundation and FNDDS are from USDA's April 2026 and October 2024 releases. Their source archives are pinned by URL and SHA256. Foods without complete energy and all three macros are omitted. Unknown nutrients stay absent; zero is preserved as zero.

`data/usda-foundation.json` records the source URL, archive SHA256, release, license, and normalized foods. Attribution: U.S. Department of Agriculture, Agricultural Research Service, FoodData Central. Data is CC0-1.0.

Every catalog food retains available nutrient values by USDA nutrient ID and units per 100 grams. Common calories and macros stay in typed columns; other values include calcium, iron, magnesium, phosphorus, zinc, vitamins, cholesterol, caffeine, and fatty acids when supplied. Foundation records can have gaps; FNDDS supplies prepared foods with 65 nutrient measures. Values are never inferred to fill gaps. Branded values are label-derived and USDA-standardized; some label nutrients are absent. Source portions retain gram weights. Raw/cooked descriptions remain explicit.

This is a starter catalog, not complete branded-product coverage. Label entry supports foods that are missing.

## Workflow and ownership

Nutrition → Add food supports search, favorites, and recent foods. Review grams or a source serving, add up to 50 foods, then save a meal. Custom labels require calories/macros for the entire portion; optional values can stay blank.

Recent meals displays the latest 30 entries with edit, confirmed delete, and reuse. Reuse opens a draft for review. Drafts survive navigation/reload in the current tab and are scoped to the account; closing the tab clears session storage.

The database derives new catalog entries' nutrients and stores snapshots. Portion edits and reuse scale saved snapshots, preserving provenance even after catalog changes. Custom labels are not described as USDA data. Each save is atomic; retries with the same operation ID do not duplicate meals. Stale revisions cannot overwrite or delete newer edits. RLS restricts meals and favorites to their owners.

## Free-text meal entry

For a prompt such as “100 g ground beef with half a red bell pepper, half a red onion, cooked in 10 g butter,” use the model only to extract ingredients, quantities, preparation, and unresolved details into validated JSON. Match each ingredient to this USDA catalog, show the proposed foods and portions for review, then calculate and save nutrients from the matched source records. Do not accept calories or nutrients written by the model as data.

Ask for clarification when it affects the result: ground-beef lean percentage, whether its weight is raw or cooked, and the weights for half-size produce. “Organic butter” alone is not a unique product; let the user select a catalog match or enter the label. Keep nutrients that the source omits as unknown instead of reporting zero. This makes the readout traceable and avoids false precision.

For the lowest recurring cost, test a small quantized open model in the browser with Transformers.js and WebGPU, while keeping a deterministic quantity parser as a fallback. Browser GPU support and speed depend on the device, and the first run may download model files. A model hosted on a server costs compute even when its weights are open source; set request limits and a hard usage budget before enabling that option. Local Ollama can avoid provider token charges but requires the user to run the model on their own machine, so it is better for development or an optional advanced mode than the default phone experience. See [Transformers.js WebGPU](https://huggingface.co/docs/transformers.js/guides/webgpu), [Ollama local and cloud privacy details](https://www.ollama.com/privacy), and [Ollama model hosting and pricing](https://ollama.com/blog/transparent-pricing).

Before choosing a model, compare a small set of real meal prompts on desktop and phone for ingredient extraction, quantity accuracy, latency, and download size. Pin the model version, validate its JSON against a schema, and include low-confidence cases that ask a short follow-up instead of saving a guessed meal.

## Maintenance and cost

`python scripts/import-usda.py --dataset foundation` or `--dataset fndds` downloads and normalizes the pinned archive, or accepts a local ZIP path for offline use. `python scripts/import-usda-branded.py` streams USDA's large branded archive and keeps at most eight label-complete products per selected brand term, with an overall cap of 640 unique products. It matches explicit brand terms, requires calories and all three macros, and keeps products with gram-based servings so nutrient scaling stays correct. The archive includes products with 100 ml nutrient values too; these are excluded until the app supports unit-aware milliliter calculations. The importer does not mirror the full archive. The scripts have no database credentials or database writes. No import is scheduled and no paid data API is used.

The import scripts write local normalized files under `data/` with release, license, and archive checksum. Those generated files and the generated seed migration are ignored by Git to keep large data snapshots out of the repository. `node scripts/generate-usda-nutrient-migration.mjs` creates `supabase/migrations/202609270004_usda_catalog_seed.sql`; use the Supabase CLI to apply it after the tracked schema migrations. Review each source update and create a **new seed migration** rather than rewriting an applied one. Stable IDs preserve food references, and saved meal nutrient snapshots remain fixed. A product's GTIN/UPC can be pasted into search; camera scanning is a separate UI step.

No paid food API, AI model, scheduled worker, new project, or subscription is added. Existing database and GitHub Actions usage still count against plan allowances. Full branded coverage needs a storage/freshness plan first.

## Validation and limits

Database tests execute the migrations with multiple roles, testing derived values, snapshots, invalid partial saves, stale edits, retries, pagination, and private favorites. Phone/desktop browser tests cover search, portions, favorites, retained drafts, multi-food saving, editing, reuse, and deletion against a fake backend. Live catalog checks confirm source counts and micronutrients; real-account end-to-end checks remain before public launch.

Dedicated saved recipes with serving yields and camera barcode scanning remain future work. The free-text meal plan above is still design guidance; no AI model, inference endpoint, request, or new recurring charge is connected yet.
