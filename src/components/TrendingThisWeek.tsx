import { useEffect, useState } from "react";
import { Apple, Dumbbell, TrendingUp } from "lucide-react";
import { supabase } from "../lib/supabase";

type TrendingExercise = {
  rank_position: number;
  exercise_id: string;
  exercise_name: string;
  unique_athletes: number;
  workout_appearances: number;
};

type TrendingFood = {
  rank_position: number;
  food_name: string;
  unique_athletes: number;
  item_logs: number;
};

export function TrendingThisWeek() {
  const [exercises, setExercises] = useState<TrendingExercise[]>([]);
  const [foods, setFoods] = useState<TrendingFood[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;
    void Promise.all([
      supabase.rpc("get_weekly_trending_exercises", { p_limit: 10 }),
      supabase.rpc("get_weekly_trending_foods", { p_limit: 10 }),
    ])
      .then(([exerciseResult, foodResult]) => {
        if (!active) return;
        if (exerciseResult.error || foodResult.error)
          setError("Community trends are temporarily unavailable.");
        if (!exerciseResult.error) {
          setExercises((exerciseResult.data ?? []) as TrendingExercise[]);
        }
        if (!foodResult.error) {
          setFoods((foodResult.data ?? []) as TrendingFood[]);
        }
      })
      .catch(() => {
        if (active) setError("Community trends are temporarily unavailable.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="card trending-card">
      <div className="spread">
        <div>
          <span className="eyebrow">COMMUNITY PULSE</span>
          <h2>Trending this week</h2>
        </div>
        <TrendingUp size={20} />
      </div>

      {error && <p role="status">{error}</p>}
      {loading ? (
        <p className="fine">Loading community trends…</p>
      ) : (
        <div className="trending-grid">
          <div>
            <h3>
              <Dumbbell size={16} /> Top exercises
            </h3>
            {exercises.length === 0 ? (
              <p className="fine">Not enough opted-in activity yet.</p>
            ) : (
              <ol className="rank-list">
                {exercises.map((row) => (
                  <li key={row.exercise_id}>
                    <span className="rank-number">#{row.rank_position}</span>
                    <div>
                      <strong>{row.exercise_name}</strong>
                      <small>
                        {row.unique_athletes.toLocaleString()} athlete
                        {row.unique_athletes === 1 ? "" : "s"} ·{" "}
                        {row.workout_appearances.toLocaleString()} workout
                        {row.workout_appearances === 1 ? "" : "s"}
                      </small>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div>
            <h3>
              <Apple size={16} /> Top foods
            </h3>
            {foods.length === 0 ? (
              <p className="fine">
                Not enough opted-in nutrition activity yet.
              </p>
            ) : (
              <ol className="rank-list">
                {foods.map((row) => (
                  <li key={`${row.rank_position}-${row.food_name}`}>
                    <span className="rank-number">#{row.rank_position}</span>
                    <div>
                      <strong>{row.food_name}</strong>
                      <small>
                        {row.unique_athletes.toLocaleString()} athlete
                        {row.unique_athletes === 1 ? "" : "s"} ·{" "}
                        {row.item_logs.toLocaleString()} log
                        {row.item_logs === 1 ? "" : "s"}
                      </small>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}

      <p className="fine">
        Weeks begin Monday at 00:00 UTC. Each entry requires at least three
        opted-in athletes. Food trends use catalog names only, never private
        custom-food text. Popularity is ranked primarily by unique opted-in
        athletes, not raw log count, so one high-volume user cannot dominate the
        list.
      </p>
    </section>
  );
}
