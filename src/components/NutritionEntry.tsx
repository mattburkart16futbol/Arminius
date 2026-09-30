import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { supabase } from "../lib/supabase";
import { children } from "../lib/workout-api";
import { readPages } from "../lib/paging";
import { additionalFoodNutrients } from "../lib/micronutrients";
import {
  draftFromItem,
  basisLabel,
  localDateTime,
  mealPayload,
  nutrients,
  scaleNutrients,
  sourceLink,
  unitLabel,
  type DraftFood,
  type Food,
  type FoodUnit,
  type MealItem,
  type MealRecord,
  type NutrientValues,
  type Provenance,
} from "../lib/food-library";
export { nutrients } from "../lib/food-library";
const label = (n: string) => n.replaceAll("_", " ");
type SavedDraft = {
  name: string;
  quantity: string;
  quantityUnit: FoodUnit;
  values: Record<string, string>;
  selected: Food | null;
  rows: DraftFood[];
  mealName: string;
  when: string;
  editing: MealRecord | null;
  request: { payload: string; id: string; operation: string } | null;
};
function readDraft(userId?: string): SavedDraft | null {
  if (!userId) return null;
  try {
    const value = JSON.parse(
      sessionStorage.getItem(`arminius:nutrition:${userId}`) ?? "null",
    );
    if (
      !value ||
      !Array.isArray(value.rows) ||
      value.rows.length > 50 ||
      !value.rows.every(
        (r: DraftFood & { grams?: string; baseGrams?: number }) =>
          r &&
          typeof r.name === "string" &&
          r.values &&
          Number.isFinite(r.baseAmount ?? r.baseGrams),
      ) ||
      typeof value.name !== "string" ||
      typeof value.when !== "string" ||
      typeof value.mealName !== "string"
    )
      return null;
    const rows = value.rows.map(
      (row: DraftFood & { grams?: string; baseGrams?: number }) => ({
        ...row,
        amount: row.amount ?? row.grams ?? "100",
        unit: row.unit ?? "g",
        baseAmount: row.baseAmount ?? row.baseGrams ?? 100,
        baseUnit: row.baseUnit ?? "g",
      }),
    );
    const rawFood = value.selected as
      | (Food & { serving_grams?: number })
      | null
      | undefined;
    const selected = rawFood
      ? {
          ...rawFood,
          serving_amount: rawFood.serving_amount ?? rawFood.serving_grams ?? 100,
          serving_unit: rawFood.serving_unit ?? "g",
          portions: (rawFood.portions ?? []).map(
            (portion: Food["portions"][number] & { grams?: number }) => ({
              ...portion,
              amount: portion.amount ?? portion.grams ?? 0,
              unit: portion.unit ?? "g",
            }),
          ),
        }
      : null;
    return {
      ...value,
      quantity: value.quantity ?? value.grams ?? "100",
      quantityUnit: value.quantityUnit ?? "g",
      rows,
      selected,
    } as SavedDraft;
  } catch {
    return null;
  }
}

function Source({ value }: { value: Provenance | null }) {
  const url = sourceLink(value?.url);
  return (
    <small className="food-source">
      {value ? (
        <>
          {url ? (
            <a href={url} target="_blank" rel="noreferrer">
              {value.source}
            </a>
          ) : (
            value.source
          )}
          {value.data_type ? ` · ${value.data_type}` : ""}
          {value.release ? ` · ${value.release}` : ""}
        </>
      ) : (
        "Your label values"
      )}
    </small>
  );
}

export function NutritionEntry({ onSaved }: { onSaved: () => void }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [initial] = useState(() => readDraft(userId));
  const [name, setName] = useState(initial?.name ?? "");
  const [quantity, setQuantity] = useState(initial?.quantity ?? "100");
  const [quantityUnit, setQuantityUnit] = useState<FoodUnit>(
    initial?.quantityUnit ?? "g",
  );
  const [values, setValues] = useState<Record<string, string>>(
    initial?.values ?? {},
  );
  const [selected, setSelected] = useState<Food | null>(
    initial?.selected ?? null,
  );
  const [foods, setFoods] = useState<Food[]>([]);
  const [favorites, setFavorites] = useState<Food[]>([]);
  const [search, setSearch] = useState("");
  const [searchMessage, setSearchMessage] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [tab, setTab] = useState<"search" | "favorites" | "recent">("search");
  const [rows, setRows] = useState<DraftFood[]>(initial?.rows ?? []);
  const [mealName, setMealName] = useState(initial?.mealName ?? "Meal");
  const [when, setWhen] = useState(() => initial?.when ?? localDateTime());
  const [editing, setEditing] = useState<MealRecord | null>(
    initial?.editing ?? null,
  );
  const [history, setHistory] = useState<MealRecord[]>([]);
  const [historyItems, setHistoryItems] = useState<MealItem[]>([]);
  const [historyError, setHistoryError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [metric, setMetric] = useState("protein_g");
  const [target, setTarget] = useState("");
  const [direction, setDirection] = useState("minimum");
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");
  const request = useRef<{
    payload: string;
    id: string;
    operation: string;
  } | null>(initial?.request ?? null);
  const sequence = useRef(0);
  const searchSequence = useRef(0);
  const composer = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!userId) return;
    try {
      sessionStorage.setItem(
        `arminius:nutrition:${userId}`,
        JSON.stringify({
          name,
          quantity,
          quantityUnit,
          values,
          selected,
          rows,
          mealName,
          when,
          editing,
          request: request.current,
        }),
      );
    } catch {
      /* Storage may be disabled; the in-memory draft still works. */
    }
  }, [
    userId,
    name,
    quantity,
    quantityUnit,
    values,
    selected,
    rows,
    mealName,
    when,
    editing,
    busy,
  ]);
  const loadLibrary = useCallback(async () => {
    const token = ++sequence.current;
    if (!supabase || !userId) return;
    const client = supabase;
    try {
      const [recent, saved] = await Promise.all([
        client
          .from("meals")
          .select("id,name,eaten_at,revision")
          .eq("user_id", userId)
          .order("eaten_at", { ascending: false })
          .order("id")
          .limit(30),
        readPages<{ food_id: string; foods: Food }>((from, to) =>
          client
            .from("food_favorites")
            .select("food_id,foods(*)")
            .eq("user_id", userId)
            .order("food_id")
            .range(from, to),
        ),
      ]);
      if (recent.error) throw recent.error;
      const meals = (recent.data ?? []) as MealRecord[];
      const items = await children<MealItem>(
        "meal_items",
        "meal_id",
        meals.map((m) => m.id),
        "*",
      );
      if (token !== sequence.current) return;
      setHistory(meals);
      setHistoryItems(items);
      setFavorites(saved.map((f) => f.foods).filter(Boolean));
      setHistoryError("");
    } catch {
      if (token === sequence.current)
        setHistoryError(
          "Unable to load your recent meals and favorites. Retry to refresh them.",
        );
    }
  }, [userId]);
  useEffect(() => {
    const libraryGeneration = sequence;
    const searchGeneration = searchSequence;
    void loadLibrary();
    return () => {
      libraryGeneration.current++;
      searchGeneration.current++;
    };
  }, [loadLibrary]);

  async function find(more = false) {
    if (!supabase) return;
    const query = search.trim();
    if (query.length < 2) {
      setSearchMessage(
        "Enter at least two characters, such as chicken or oats.",
      );
      return;
    }
    const token = ++searchSequence.current;
    setSearching(true);
    try {
      const { data, error } = await supabase.rpc("search_foods", {
        p_query: query,
        p_offset: more ? foods.length : 0,
      });
      if (error) throw error;
      if (token !== searchSequence.current) return;
      const results = (data ?? []) as Food[];
      setFoods((old) => (more ? [...old, ...results] : results));
      setHasMore(results.length === 50);
      setSearchMessage(
        results.length
          ? "Choose the preparation that matches what you ate."
          : more
            ? "All matches shown."
            : "No matches in this starter catalog. Use label entry below for packaged products or other foods.",
      );
    } catch {
      if (token === searchSequence.current)
        setSearchMessage(
          "Food search unavailable. You can still enter label values.",
        );
    } finally {
      if (token === searchSequence.current) setSearching(false);
    }
  }
  function choose(food: Food) {
    setSelected(food);
    setName(food.name);
    setQuantity(String(food.serving_amount));
    setQuantityUnit(food.serving_unit);
    setValues({});
  }
  function clearFood() {
    setSelected(null);
    setName("");
    setQuantity("100");
    setQuantityUnit("g");
    setValues({});
  }
  function resetMeal() {
    if (composer.current) composer.current.open = false;
    setRows([]);
    setEditing(null);
    setMealName("Meal");
    setWhen(localDateTime());
    request.current = null;
    clearFood();
  }
  function addFood() {
    try {
      if (!name.trim() || name.length > 200)
        throw new Error("Enter a food name or choose a catalog food.");
      const data =
        selected ??
        (Object.fromEntries(
          nutrients.map((n, i) => [
            n,
            values[n]?.trim() ? Number(values[n]) : i < 4 ? NaN : null,
          ]),
        ) as unknown as NutrientValues);
      const row: DraftFood = {
        key: crypto.randomUUID(),
        name: name.trim(),
        foodId: selected?.id,
        amount: quantity,
        unit: selected?.serving_unit ?? quantityUnit,
        baseAmount: selected?.serving_amount ?? Number(quantity),
        baseUnit: selected?.serving_unit ?? quantityUnit,
        values: data,
        source: selected
          ? {
              source: selected.source,
              source_id: selected.source_id,
              url: selected.source_url,
              release: selected.source_release,
              data_type: selected.source_data_type,
            }
          : null,
      };
      mealPayload([...rows, row]);
      setRows([...rows, row]);
      clearFood();
      setMessage("Food added. Add another food or save your meal.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Check your food values.");
    }
  }
  async function save() {
    if (!supabase || busy) return;
    try {
      if (name.trim() || selected)
        throw new Error(
          "Add the food you are entering to the meal first, or clear it.",
        );
      const at = new Date(when);
      if (
        !mealName.trim() ||
        mealName.length > 200 ||
        !Number.isFinite(at.getTime()) ||
        at.getTime() > Date.now()
      )
        throw new Error(
          "Enter a meal name and a valid time that is not in the future.",
        );
      const items = mealPayload(rows);
      const payload = JSON.stringify({ mealName, when, items, editing });
      if (request.current?.payload !== payload)
        request.current = {
          payload,
          id: editing?.id ?? crypto.randomUUID(),
          operation: crypto.randomUUID(),
        };
      setBusy(true);
      const { error } = await supabase.rpc("save_meal", {
        p_id: request.current.id,
        p_expected_revision: editing?.revision ?? 0,
        p_operation: request.current.operation,
        p_name: mealName.trim(),
        p_eaten_at: at.toISOString(),
        p_items: items,
      });
      if (error)
        throw new Error(
          error.message.includes("Meal changed")
            ? "This meal changed elsewhere. Your draft is kept here; reload the meal from recent meals before editing again."
            : "Unable to save. Your draft is kept here; retry when connected.",
        );
      resetMeal();
      setMessage("Meal saved.");
      onSaved();
      await loadLibrary();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to save meal.");
    } finally {
      setBusy(false);
    }
  }
  function openMeal(meal: MealRecord, repeat: boolean) {
    if (rows.length || name.trim()) {
      setMessage(
        "Save or discard your current draft before opening another meal.",
      );
      return;
    }
    setEditing(repeat ? null : meal);
    setMealName(meal.name);
    setWhen(repeat ? localDateTime() : localDateTime(new Date(meal.eaten_at)));
    setRows(
      historyItems.filter((i) => i.meal_id === meal.id).map(draftFromItem),
    );
    request.current = null;
    if (composer.current) {
      composer.current.open = true;
      composer.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setMessage(
      repeat
        ? "Review the portions and time, then save this new meal."
        : "Editing this meal. Existing nutrition values are preserved when portions change.",
    );
  }
  async function remove(meal: MealRecord) {
    if (!supabase || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("delete_meal", {
        p_id: meal.id,
        p_expected_revision: meal.revision,
      });
      if (error) throw error;
      if (editing?.id === meal.id) resetMeal();
      setConfirmDelete(null);
      setMessage("Meal deleted.");
      onSaved();
      await loadLibrary();
    } catch {
      setMessage(
        "Could not delete this meal. Refresh recent meals and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function toggleFavorite(food: Food) {
    if (!supabase || !userId || busy) return;
    setBusy(true);
    const has = favorites.some((f) => f.id === food.id);
    const { error } = has
      ? await supabase
          .from("food_favorites")
          .delete()
          .eq("user_id", userId)
          .eq("food_id", food.id)
      : await supabase
          .from("food_favorites")
          .upsert(
            { user_id: userId, food_id: food.id },
            { onConflict: "user_id,food_id", ignoreDuplicates: true },
          );
    if (error) setMessage("Could not update favorite. Try again.");
    else
      setFavorites((old) =>
        has ? old.filter((f) => f.id !== food.id) : [...old, food],
      );
    setBusy(false);
  }
  async function saveTarget() {
    if (!supabase || busy) return;
    const n = Number(target);
    if (!target || !Number.isFinite(n) || n <= 0 || n > 1000000) {
      setMessage("Enter a positive target up to 1,000,000.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("save_daily_nutrition_target", {
      p_metric: metric,
      p_value: n,
      p_direction: direction,
    });
    setMessage(error ? "Unable to save target." : "Daily target saved.");
    if (!error) onSaved();
    setBusy(false);
  }
  let preview: NutrientValues | null = null;
  if (selected) {
    try {
      preview = scaleNutrients(
        selected,
        selected.serving_amount,
        Number(quantity),
      );
    } catch {
      /* Invalid quantities are validated on add. */
    }
  }
  const expandedNutrients = preview?.nutrient_values
    ? additionalFoodNutrients(preview.nutrient_values)
    : [];
  const displayedFoods = tab === "favorites" ? favorites : foods;
  const recentFoods = history
    .flatMap((m) => historyItems.filter((i) => i.meal_id === m.id))
    .filter(
      (item, index, all) =>
        all.findIndex(
          (other) =>
            (other.food_id ?? other.name) === (item.food_id ?? item.name),
        ) === index,
    )
    .slice(0, 12);
  let totalCalories: number | null = null;
  try {
    totalCalories = rows.length
      ? mealPayload(rows).reduce(
          (sum, item) => sum + (item.nutrients.calories ?? 0),
          0,
        )
      : 0;
  } catch {
    /* Invalid drafts stay editable. */
  }
  return (
    <section className="card nutrition-logger">
      <h2>Meals & food library</h2>
      <p className="fine">
        Search USDA ingredients, prepared foods, and selected packaged foods by
        name or barcode. Enter a label for anything missing. Check raw/cooked
        preparation; missing nutrients stay unknown.
      </p>
      <p role="status" className="nutrition-feedback">
        {message}
      </p>
      <fieldset disabled={busy || !supabase} className="logger-fieldset">
        <details ref={composer} open={initial?.rows.length ? true : undefined}>
          <summary>{editing ? "Edit meal" : "Add food"}</summary>
          <div className="set-inputs">
            <label>
              Meal name
              <input
                value={mealName}
                maxLength={200}
                onChange={(e) => setMealName(e.target.value)}
              />
            </label>
            <label>
              Eaten at
              <input
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
              />
            </label>
          </div>
          <div className="range-tabs food-tabs" aria-label="Food library">
            {(
              [
                ["search", "Search"],
                ["favorites", "Favorites"],
                ["recent", "Recent foods"],
              ] as const
            ).map(([key, title]) => (
              <button
                key={key}
                aria-pressed={tab === key}
                className={tab === key ? "selected" : ""}
                onClick={() => setTab(key)}
              >
                {title}
              </button>
            ))}
          </div>
          {tab === "search" && (
            <>
              <label>
                Search food catalog
                <input
                  maxLength={100}
                  value={search}
                  placeholder="e.g. chicken, oats, apple, or barcode"
                  onChange={(e) => {
                    setSearch(e.target.value);
                    searchSequence.current++;
                    setSearching(false);
                    setHasMore(false);
                    setFoods([]);
                    setSearchMessage("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void find();
                    }
                  }}
                />
              </label>
              <button disabled={searching} onClick={() => void find()}>
                {searching ? "Searching…" : "Search foods"}
              </button>
              <p className="fine" role="status">
                {searchMessage}
              </p>
            </>
          )}
          {tab !== "recent" && (
            <div className="food-results">
              {displayedFoods.map((food) => (
                <article key={food.id} className="food-result">
                  <button className="food-choice" onClick={() => choose(food)}>
                    <strong>{food.name}</strong>
                    {food.brand && <small>{food.brand}</small>}
                    <span>
                      {Math.round(food.calories ?? 0)} kcal ·{" "}
                      {food.protein_g?.toFixed(1)} g protein /{" "}
                      {basisLabel(food.serving_amount, food.serving_unit)}
                    </span>
                  </button>
                  <Source
                    value={{
                      source: food.source,
                      url: food.source_url,
                      release: food.source_release,
                    }}
                  />
                  <button
                    aria-label={`${favorites.some((f) => f.id === food.id) ? "Unfavorite" : "Favorite"} ${food.name}`}
                    aria-pressed={favorites.some((f) => f.id === food.id)}
                    onClick={() => void toggleFavorite(food)}
                  >
                    {favorites.some((f) => f.id === food.id)
                      ? "★ Saved"
                      : "☆ Favorite"}
                  </button>
                </article>
              ))}
            </div>
          )}
          {tab === "favorites" && favorites.length === 0 && (
            <p className="fine">Favorite a food from search to find it here.</p>
          )}
          {tab === "search" && hasMore && (
            <button disabled={searching} onClick={() => void find(true)}>
              More matches
            </button>
          )}
          {tab === "recent" && (
            <div className="food-results">
              {recentFoods.length === 0 ? (
                <p>No recent foods yet.</p>
              ) : (
                recentFoods.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (rows.length >= 50) {
                        setMessage("A meal can contain up to 50 foods.");
                        return;
                      }
                      setRows([...rows, draftFromItem(item)]);
                      setMessage(
                        "Recent food added with its saved nutrition values.",
                      );
                    }}
                  >
                    <strong>{item.name}</strong>
                    <span>
                      {" "}· {item.quantity} {unitLabel(item.quantity_unit, item.quantity)}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
          <div className="food-editor">
            <h3>
              {selected ? "Review your portion" : "Enter food label values"}
            </h3>
            <label>
              Food name
              <input
                maxLength={200}
                value={name}
                readOnly={Boolean(selected)}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            {selected && (
              <Source
                value={{
                  source: selected.source,
                  url: selected.source_url,
                  release: selected.source_release,
                  data_type: selected.source_data_type,
                }}
              />
            )}
            {selected && selected.portions?.length > 0 && (
              <label>
                Source serving size
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) setQuantity(e.target.value);
                  }}
                >
                  <option value="">Choose a serving or enter a quantity</option>
                  {selected.portions.map((p, i) => (
                    <option key={i} value={p.amount}>
                      {p.label.replaceAll("RACC", "USDA reference portion")} (
                      {p.amount} {unitLabel(p.unit, p.amount)})
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Portion ({selected ? unitLabel(selected.serving_unit, Number(quantity)) : unitLabel(quantityUnit, Number(quantity))})
              <input
                type="number"
                min="0.01"
                max="100000"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>
            {!selected && (
              <label>
                Portion unit
                <select
                  value={quantityUnit}
                  onChange={(e) => setQuantityUnit(e.target.value as FoodUnit)}
                >
                  <option value="g">Grams (g)</option>
                  <option value="ml">Milliliters (ml)</option>
                  <option value="serving">Servings</option>
                </select>
              </label>
            )}
            {!selected && (
              <p className="fine">
                Enter label nutrients for exactly this amount and unit.
              </p>
            )}
            {selected ? (
              <>
                <div className="nutrient-grid">
                  {nutrients.map((n) => (
                    <div key={n}>
                      <span>{label(n)}</span>
                      <strong>
                        {preview?.[n] == null
                          ? "Unknown"
                          : preview[n]!.toFixed(1)}
                      </strong>
                    </div>
                  ))}
                </div>
                {expandedNutrients.length > 0 && (
                  <details className="source-nutrients">
                    <summary>
                      {expandedNutrients.length} additional USDA nutrients
                    </summary>
                    <div className="nutrient-grid">
                      {expandedNutrients.map((fact) => (
                        <div key={fact.id}>
                          <span>{fact.name}</span>
                          <strong>
                            {fact.amount.toLocaleString(undefined, {
                              maximumFractionDigits: 2,
                            })}{" "}
                            {fact.unit}
                          </strong>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </>
            ) : (
              <>
                <p className="fine">
                  Enter calories and nutrients for the entire portion above.
                  Blank optional nutrients mean unknown.
                </p>
                <div className="set-inputs">
                  {nutrients.map((n, i) => (
                    <label key={n}>
                      {label(n)}
                      {i > 3 ? " (optional)" : ""}
                      <input
                        type="number"
                        min="0"
                        max="1000000"
                        step="any"
                        value={values[n] ?? ""}
                        onChange={(e) =>
                          setValues({ ...values, [n]: e.target.value })
                        }
                      />
                    </label>
                  ))}
                </div>
              </>
            )}
            <div className="meal-actions">
              <button onClick={addFood}>Add to meal</button>
              <button onClick={clearFood}>Clear food</button>
            </div>
          </div>
          <h3>Your meal · {rows.length} foods</h3>
          {rows.map((row, index) => (
            <div className="draft-food" key={row.key}>
              <strong>{row.name}</strong>
              <Source value={row.source} />
              <label>
                Portion for item {index + 1} ({unitLabel(row.unit, Number(row.amount))})
                <input
                  type="number"
                  min="0.01"
                  max="100000"
                  step="any"
                  value={row.amount}
                  onChange={(e) =>
                    setRows(
                      rows.map((r) =>
                        r.key === row.key ? { ...r, amount: e.target.value } : r,
                      ),
                    )
                  }
                />
              </label>
              <button
                aria-label={`Remove item ${index + 1}`}
                onClick={() => setRows(rows.filter((r) => r.key !== row.key))}
              >
                Remove
              </button>
            </div>
          ))}
          <p>
            {totalCalories === null
              ? "Check meal portions."
              : `${Math.round(totalCalories)} kcal in this meal`}
          </p>
          <div className="meal-actions">
            <button
              className="primary"
              disabled={rows.length === 0}
              onClick={() => void save()}
            >
              {busy ? "Saving…" : editing ? "Save changes" : "Save meal"}
            </button>
            <button
              onClick={() => {
                resetMeal();
                setMessage("Draft discarded.");
              }}
            >
              Discard draft
            </button>
          </div>
        </details>
        <details>
          <summary>Set a daily nutrition target</summary>
          <label>
            Nutrient
            <select value={metric} onChange={(e) => setMetric(e.target.value)}>
              {nutrients.map((n) => (
                <option key={n} value={n}>
                  {label(n)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Target value
            <input
              type="number"
              min="0"
              max="1000000"
              step="any"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </label>
          <label>
            Target direction
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
            >
              <option value="minimum">Minimum</option>
              <option value="maximum">Maximum</option>
              <option value="target">Within 10% of target</option>
            </select>
          </label>
          <button onClick={() => void saveTarget()}>Save daily target</button>
          <p className="fine">
            Your current targets are compared with logged days in the selected
            period.
          </p>
        </details>
        <h3>Recent meals</h3>
        <p className="fine">
          Your latest 30 meals. Reuse a meal to review its foods and log it
          again.
        </p>
        {historyError && <p role="alert">{historyError}</p>}
        <button onClick={() => void loadLibrary()}>Refresh recent meals</button>
        {history.length === 0 && !historyError && <p>No meals logged yet.</p>}
        <div className="meal-history">
          {history.map((meal) => (
            <article className="meal-record" key={meal.id}>
              <div className="spread">
                <strong>{meal.name}</strong>
                <time dateTime={meal.eaten_at}>
                  {new Date(meal.eaten_at).toLocaleString()}
                </time>
              </div>
              <ul>
                {historyItems
                  .filter((i) => i.meal_id === meal.id)
                  .map((i) => (
                    <li key={i.id}>
                      {i.name} · {i.quantity} {unitLabel(i.quantity_unit, i.quantity)} ·{" "}
                      {Math.round(i.calories ?? 0)} kcal
                    </li>
                  ))}
              </ul>
              <div className="meal-actions">
                <button onClick={() => openMeal(meal, false)}>Edit</button>
                <button onClick={() => openMeal(meal, true)}>
                  Use meal again
                </button>
                <button onClick={() => setConfirmDelete(meal.id)}>
                  Delete
                </button>
              </div>
              {confirmDelete === meal.id && (
                <div role="group" aria-label="Confirm meal deletion">
                  <p>Delete this meal and all of its foods?</p>
                  <button onClick={() => void remove(meal)}>
                    Delete this meal
                  </button>
                  <button onClick={() => setConfirmDelete(null)}>
                    Keep meal
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      </fieldset>
    </section>
  );
}
