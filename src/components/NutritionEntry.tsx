import { useRef, useState } from "react";
import { supabase } from "../lib/supabase";
export const nutrients = [
  "calories",
  "protein_g",
  "carbs_g",
  "fat_g",
  "fiber_g",
  "sugar_g",
  "saturated_fat_g",
  "sodium_mg",
  "potassium_mg",
] as const;
const label = (n: string) => n.replaceAll("_", " ");
type Food = { id: string; name: string; serving_grams: number } & Record<
  (typeof nutrients)[number],
  number | null
>;
export function NutritionEntry({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState("");
  const [grams, setGrams] = useState("100");
  const [values, setValues] = useState<Record<string, string>>({});
  const [foods, setFoods] = useState<Food[]>([]);
  const [foodId, setFoodId] = useState("");
  const [search, setSearch] = useState("");
  const [when, setWhen] = useState(() => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  });
  const [metric, setMetric] = useState("protein_g");
  const [target, setTarget] = useState("");
  const [direction, setDirection] = useState("minimum");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const request = useRef<{ payload: string; id: string } | null>(null);
  async function find() {
    if (!supabase) return;
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("foods")
        .select("*")
        .ilike(
          "name",
          `%${search.trim().replaceAll("%", "").replaceAll("_", "")}%`,
        )
        .order("name")
        .order("id")
        .limit(100);
      if (error) throw error;
      setFoods((data ?? []) as Food[]);
      setMessage(
        data?.length
          ? "Choose a food or enter your own label values."
          : "No catalog matches. You can enter values from a food label below.",
      );
    } catch {
      setMessage("Food search unavailable. You can still enter label values.");
    } finally {
      setBusy(false);
    }
  }
  function choose(id: string, g = grams) {
    setFoodId(id);
    const food = foods.find((f) => f.id === id);
    if (!food) return;
    setName(food.name);
    setValues(
      Object.fromEntries(
        nutrients.map((n) => [
          n,
          food[n] === null
            ? ""
            : String(
                Number(
                  (((food[n] ?? 0) * Number(g)) / food.serving_grams).toFixed(
                    3,
                  ),
                ),
              ),
        ]),
      ),
    );
  }
  async function save() {
    if (!supabase || busy) return;
    const at = new Date(when);
    if (
      !name.trim() ||
      name.length > 200 ||
      !(Number(grams) > 0) ||
      !Number.isFinite(Number(grams)) ||
      !Number.isFinite(at.getTime()) ||
      at.getTime() > Date.now()
    ) {
      setMessage(
        "Enter a food name, a positive portion, and a valid time that is not in the future.",
      );
      return;
    }
    const data = Object.fromEntries(
      nutrients.map((n, i) => [
        n,
        values[n]?.trim() ? Number(values[n]) : i < 4 ? NaN : null,
      ]),
    );
    if (
      Object.values(data).some(
        (v) => v !== null && (!Number.isFinite(v) || v < 0),
      )
    ) {
      setMessage(
        "Enter calories and all three macros. Optional nutrients may be blank; known values must be zero or greater.",
      );
      return;
    }
    const payload = JSON.stringify({ name, grams, data, when, foodId });
    if (request.current?.payload !== payload)
      request.current = { payload, id: crypto.randomUUID() };
    setBusy(true);
    try {
      const { error } = await supabase.rpc("save_meal_entry", {
        p_id: request.current.id,
        p_name: name.trim(),
        p_grams: Number(grams),
        p_eaten_at: at.toISOString(),
        p_food_id: foodId || null,
        p_nutrients: data,
      });
      if (error) throw error;
      request.current = null;
      setName("");
      setValues({});
      setFoodId("");
      setMessage("Meal saved.");
      onSaved();
    } catch {
      setMessage(
        "Unable to save the meal. Your entries remain here; check the database update and retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function saveTarget() {
    if (!supabase || busy) return;
    const n = Number(target);
    if (!target || !Number.isFinite(n) || n <= 0) {
      setMessage("Enter a positive target.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("save_daily_nutrition_target", {
        p_metric: metric,
        p_value: n,
        p_direction: direction,
      });
      if (error) throw error;
      setMessage("Daily target saved.");
      onSaved();
    } catch {
      setMessage("Unable to save target.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <h2>Log food & set targets</h2>
      <fieldset disabled={busy || !supabase} className="logger-fieldset">
        <details>
          <summary>Add food</summary>
          <label>
            Search food catalog
            <input value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <button onClick={() => void find()}>Search foods</button>
          {foods.length > 0 && (
            <label>
              Catalog food (first 100 matches)
              <select value={foodId} onChange={(e) => choose(e.target.value)}>
                <option value="">Custom food</option>
                {foods.map((f) => (
                  <option value={f.id} key={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Food name
            <input
              maxLength={200}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setFoodId("");
              }}
            />
          </label>
          <div className="set-inputs">
            <label>
              Portion (grams)
              <input
                type="number"
                min="0"
                step="any"
                value={grams}
                onChange={(e) => {
                  setGrams(e.target.value);
                  if (foodId) choose(foodId, e.target.value);
                }}
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
          <p className="fine">
            Enter nutrients for the entire consumed portion. Catalog values
            scale with grams. Blank optional nutrients mean unknown.
          </p>
          <div className="set-inputs">
            {nutrients.map((n, i) => (
              <label key={n}>
                {label(n)}
                {i > 3 ? " (optional)" : ""}
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={values[n] ?? ""}
                  onChange={(e) =>
                    setValues({ ...values, [n]: e.target.value })
                  }
                />
              </label>
            ))}
          </div>
          <button className="primary" onClick={() => void save()}>
            Save food entry
          </button>
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
      </fieldset>
      <p role="status">{message}</p>
    </section>
  );
}
