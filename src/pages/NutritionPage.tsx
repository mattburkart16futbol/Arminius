import { NutritionEntry } from "../components/NutritionEntry";
import { children } from "../lib/workout-api";
import { readPages } from "../lib/paging";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { Apple, Flame, Gauge, HeartPulse, Salad } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import {
  aggregateDailyNutrition,
  averageNutrition,
  macroCalorieShares,
  optionalMetricCoverage,
  targetAdherence,
  type NutritionMeal,
  type NutritionMealItem,
  type NutritionTarget,
} from "../lib/nutritionAnalytics";
import { supabase } from "../lib/supabase";
import { averageMicronutrients } from "../lib/micronutrients";

type RangeDays = 7 | 30 | 90;

function formatNumber(value: number | null, digits = 0) {
  return value === null ? "—" : value.toFixed(digits);
}

function formatPercent(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

export function NutritionPage() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const generation = useRef(0);
  const [rangeDays, setRangeDays] = useState<RangeDays>(30);
  const [meals, setMeals] = useState<NutritionMeal[]>([]);
  const [items, setItems] = useState<NutritionMealItem[]>([]);
  const [targets, setTargets] = useState<NutritionTarget[]>([]);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const token = ++generation.current;
    if (!supabase || !userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const sinceDate = new Date();
      sinceDate.setHours(0, 0, 0, 0);
      sinceDate.setDate(sinceDate.getDate() - rangeDays + 1);
      const since = sinceDate.toISOString();
      const until = new Date().toISOString();
      const client = supabase;
      const [nextMeals, nextTargets] = await Promise.all([
        readPages<NutritionMeal>((from, to) =>
          client
            .from("meals")
            .select("id,eaten_at")
            .eq("user_id", userId)
            .gte("eaten_at", since)
            .lte("eaten_at", until)
            .order("eaten_at")
            .order("id")
            .range(from, to),
        ),
        readPages<NutritionTarget>((from, to) =>
          client
            .from("targets")
            .select("metric,target_value,period,direction,created_at")
            .eq("user_id", userId)
            .eq("period", "daily")
            .is("goal_id", null)
            .order("created_at")
            .order("id")
            .range(from, to),
        ),
      ]);
      const nextItems = await children<NutritionMealItem>(
        "meal_items",
        "meal_id",
        nextMeals.map((m) => m.id),
        "id,meal_id,calories,protein_g,carbs_g,fat_g,fiber_g,sugar_g,saturated_fat_g,sodium_mg,potassium_mg,nutrient_values",
      );
      if (token !== generation.current) return;
      setMeals(nextMeals);
      setTargets(nextTargets);
      setItems(nextItems);
    } catch {
      if (token === generation.current) {
        setMeals([]);
        setItems([]);
        setTargets([]);
        setError(
          "Unable to load your nutrition metrics. Check the database update and retry.",
        );
      }
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }, [rangeDays, userId]);

  useEffect(() => {
    const pending = generation;
    void load();
    return () => {
      pending.current++;
    };
  }, [load]);

  const days = useMemo(
    () => aggregateDailyNutrition(meals, items),
    [items, meals],
  );
  const averages = useMemo(() => averageNutrition(days), [days]);
  const adherence = useMemo(
    () => targetAdherence(days, targets),
    [days, targets],
  );
  const macroShares = useMemo(
    () =>
      macroCalorieShares({
        protein_g: averages.protein_g ?? 0,
        carbs_g: averages.carbs_g ?? 0,
        fat_g: averages.fat_g ?? 0,
      }),
    [averages.carbs_g, averages.fat_g, averages.protein_g],
  );
  const micronutrients = useMemo(
    () => averageMicronutrients(meals, items),
    [items, meals],
  );

  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">FUEL THE WORK</p>
        <h1>Your nutrition, measured.</h1>
        <p>
          Daily averages, nutrient coverage, and target consistency from your
          logged meals.
        </p>
      </div>

      <div className="analytics-toolbar">
        <div className="range-tabs" aria-label="Nutrition range">
          {([7, 30, 90] as const).map((daysInRange) => (
            <button
              className={rangeDays === daysInRange ? "selected" : ""}
              aria-pressed={rangeDays === daysInRange}
              key={daysInRange}
              onClick={() => setRangeDays(daysInRange)}
            >
              {daysInRange} days
            </button>
          ))}
        </div>
      </div>

      <NutritionEntry key={userId ?? "preview"} onSaved={() => void load()} />
      <p className="fine">
        Calendar days in this device’s local timezone. Unlogged days are
        excluded. Optional nutrient averages use only complete logged days.
      </p>
      {loading && <p role="status">Refreshing nutrition…</p>}
      <p role="alert">{error}</p>
      {error && <button onClick={() => void load()}>Retry nutrition</button>}

      {days.length === 0 ? (
        <section className="card">
          <Apple className="section-icon" />
          <h2>No nutrition history in this period.</h2>
          <div className="empty">
            <p>Your logged meals will build these metrics.</p>
            <small>
              Arminius does not treat unlogged days as zero-calorie days.
            </small>
          </div>
        </section>
      ) : (
        <>
          <div className="analytics-kpis nutrition-kpis">
            <article className="metric-card">
              <Flame size={18} />
              <span>Avg calories</span>
              <strong>{formatNumber(averages.calories)} kcal</strong>
            </article>
            <article className="metric-card">
              <Gauge size={18} />
              <span>Avg protein</span>
              <strong>{formatNumber(averages.protein_g)} g</strong>
            </article>
            <article className="metric-card">
              <Salad size={18} />
              <span>Avg fiber</span>
              <strong>{formatNumber(averages.fiber_g, 1)} g</strong>
            </article>
            <article className="metric-card">
              <HeartPulse size={18} />
              <span>Logged days</span>
              <strong>{averages.loggedDays}</strong>
            </article>
          </div>

          <div className="nutrition-grid">
            <section className="card">
              <div className="spread">
                <h2>Average daily intake</h2>
                <span className="badge">Logged days only</span>
              </div>
              <div className="nutrient-grid">
                <div>
                  <span>Protein</span>
                  <strong>{formatNumber(averages.protein_g)} g</strong>
                </div>
                <div>
                  <span>Carbs</span>
                  <strong>{formatNumber(averages.carbs_g)} g</strong>
                </div>
                <div>
                  <span>Fat</span>
                  <strong>{formatNumber(averages.fat_g)} g</strong>
                </div>
                <div>
                  <span>Fiber</span>
                  <strong>{formatNumber(averages.fiber_g, 1)} g</strong>
                </div>
                <div>
                  <span>Sodium</span>
                  <strong>{formatNumber(averages.sodium_mg)} mg</strong>
                </div>
                <div>
                  <span>Potassium</span>
                  <strong>{formatNumber(averages.potassium_mg)} mg</strong>
                </div>
                <div>
                  <span>Sugar</span>
                  <strong>{formatNumber(averages.sugar_g, 1)} g</strong>
                </div>
                <div>
                  <span>Saturated fat</span>
                  <strong>{formatNumber(averages.saturated_fat_g, 1)} g</strong>
                </div>
              </div>
              <p className="fine">
                Optional nutrients display only when every logged item for that
                day has a known value. Missing micronutrients are never silently
                counted as zero.
              </p>
            </section>

            <section className="card">
              <h2>Macro calorie split</h2>
              <div className="macro-split">
                <div>
                  <span>Protein</span>
                  <strong>{Math.round(macroShares.protein * 100)}%</strong>
                  <div className="workload-track">
                    <i style={{ width: `${macroShares.protein * 100}%` }} />
                  </div>
                </div>
                <div>
                  <span>Carbs</span>
                  <strong>{Math.round(macroShares.carbs * 100)}%</strong>
                  <div className="workload-track">
                    <i style={{ width: `${macroShares.carbs * 100}%` }} />
                  </div>
                </div>
                <div>
                  <span>Fat</span>
                  <strong>{Math.round(macroShares.fat * 100)}%</strong>
                  <div className="workload-track">
                    <i style={{ width: `${macroShares.fat * 100}%` }} />
                  </div>
                </div>
              </div>
              <p className="fine">
                Macro shares use 4 kcal/g for protein and carbohydrate and 9
                kcal/g for fat. They may not exactly match label calories.
              </p>
            </section>

            <section className="card">
              <div className="spread">
                <h2>Target consistency</h2>
                <span className="badge">Daily targets</span>
              </div>
              {Object.keys(adherence).length === 0 ? (
                <div className="empty">
                  <p>No daily nutrition targets yet.</p>
                  <small>Add targets to see adherence.</small>
                </div>
              ) : (
                <div className="best-list">
                  {Object.entries(adherence).map(([metric, value]) => (
                    <div className="history-row" key={metric}>
                      <div>
                        <strong>{metric.replaceAll("_", " ")}</strong>
                        <small>
                          {value?.successfulDays ?? 0} of{" "}
                          {value?.eligibleDays ?? 0} eligible days
                        </small>
                      </div>
                      <span>{formatPercent(value?.rate ?? null)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="card">
              <h2>Micronutrient data coverage</h2>
              <div className="coverage-list">
                {(
                  [
                    ["Fiber", "fiber_g"],
                    ["Sodium", "sodium_mg"],
                    ["Potassium", "potassium_mg"],
                    ["Sugar", "sugar_g"],
                    ["Saturated fat", "saturated_fat_g"],
                  ] as const
                ).map(([label, metric]) => {
                  const coverage = optionalMetricCoverage(days, metric);
                  return (
                    <div key={metric}>
                      <div className="spread">
                        <strong>{label}</strong>
                        <span>{Math.round(coverage * 100)}%</span>
                      </div>
                      <div className="workload-track">
                        <i style={{ width: `${coverage * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="fine">
                Coverage tells you how much of the underlying meal-item data
                actually contains that nutrient.
              </p>
            </section>
          </div>

          <section className="card">
            <div className="spread">
              <h2>Vitamins and minerals</h2>
              <span className="badge">Sourced meal data</span>
            </div>
            <div className="nutrient-grid">
              {micronutrients.map((nutrient) => (
                <div key={nutrient.id}>
                  <span>{nutrient.name}</span>
                  <strong>
                    {nutrient.average === null
                      ? "—"
                      : `${nutrient.average.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${nutrient.unit}`}
                  </strong>
                  <small>
                    {nutrient.completeDays}/{nutrient.loggedDays} complete days
                  </small>
                </div>
              ))}
            </div>
            <p className="fine">
              Averages include only days where every logged food had a sourced
              value for that nutrient. An em dash means there is not enough
              complete data yet.
            </p>
          </section>
        </>
      )}
    </>
  );
}

