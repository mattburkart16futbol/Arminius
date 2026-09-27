import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { Award, Dumbbell, UsersRound } from "lucide-react";
import { supabase } from "../lib/supabase";

type Scope = "platform" | "friends";
type Metric = "absolute" | "relative" | "growth";
type Limit = 25 | 100 | 500;

type BenchmarkLift = {
  exercise_id: string;
  display_name: string;
  category: "chest" | "back" | "legs" | "shoulders";
  sort_order: number;
  machine_variability_note: boolean;
};

type LeaderboardRow = {
  rank_position: number;
  alias: string;
  score: number;
  metric: Metric;
  cohort_size: number;
};

const categoryLabels = {
  chest: "Chest",
  back: "Back",
  legs: "Legs",
  shoulders: "Shoulders",
} as const;

function scoreLabel(row: LeaderboardRow) {
  if (row.metric === "relative") return `${Number(row.score).toFixed(2)}× BW`;
  if (row.metric === "growth") {
    const value = Number(row.score);
    return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
  }
  return `${Number(row.score).toFixed(1)} kg e1RM`;
}

export function LeaderboardsPage() {
  const generation = useRef(0);
  const [lifts, setLifts] = useState<BenchmarkLift[]>([]);
  const [exerciseId, setExerciseId] = useState("");
  const [scope, setScope] = useState<Scope>("friends");
  const [metric, setMetric] = useState<Metric>("relative");
  const [limit, setLimit] = useState<Limit>(25);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;
    void supabase
      .from("benchmark_lifts")
      .select(
        "exercise_id,display_name,category,sort_order,machine_variability_note",
      )
      .eq("active", true)
      .order("sort_order")
      .then(({ data, error: liftError }) => {
        if (!active) return;
        if (liftError) {
          setError("Unable to load benchmark lifts.");
          setLoading(false);
          return;
        }
        const next = (data ?? []) as BenchmarkLift[];
        setLifts(next);
        setExerciseId((current) => current || next[0]?.exercise_id || "");
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const loadLeaderboard = useCallback(async () => {
    const token = ++generation.current;
    if (!supabase || !exerciseId) return;
    setLoading(true);
    setError("");
    try {
      const { data, error: queryError } = await supabase.rpc(
        "get_benchmark_leaderboard",
        {
          p_exercise_id: exerciseId,
          p_scope: scope,
          p_metric: metric,
          p_limit: limit,
        },
      );
      if (token !== generation.current) return;
      if (queryError) throw queryError;
      setRows((data ?? []) as LeaderboardRow[]);
    } catch {
      if (token !== generation.current) return;
      setRows([]);
      setError("Unable to load this leaderboard.");
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }, [exerciseId, limit, metric, scope]);

  useEffect(() => {
    const pending = generation;
    void loadLeaderboard();
    return () => {
      pending.current++;
    };
  }, [loadLeaderboard]);

  const selectedLift = lifts.find((lift) => lift.exercise_id === exerciseId);
  const grouped = useMemo(
    () =>
      (Object.keys(categoryLabels) as BenchmarkLift["category"][]).map(
        (category) => ({
          category,
          lifts: lifts.filter((lift) => lift.category === category),
        }),
      ),
    [lifts],
  );

  const cohortSize = rows[0]?.cohort_size ?? 0;

  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">BENCHMARK YOUR PROGRESS</p>
        <h1>Strength leaderboards.</h1>
        <p>
          A small set of benchmark movements keeps comparisons understandable
          instead of turning every exercise into a ranking.
        </p>
      </div>

      <div className="benchmark-layout">
        <aside className="card benchmark-picker">
          <h2>Benchmark lifts</h2>
          {grouped.map(
            (group) =>
              group.lifts.length > 0 && (
                <div key={group.category} className="benchmark-group">
                  <h3>{categoryLabels[group.category]}</h3>
                  {group.lifts.map((lift) => (
                    <button
                      className={
                        lift.exercise_id === exerciseId ? "selected" : ""
                      }
                      key={lift.exercise_id}
                      aria-pressed={lift.exercise_id === exerciseId}
                      onClick={() => setExerciseId(lift.exercise_id)}
                    >
                      {lift.display_name}
                    </button>
                  ))}
                </div>
              ),
          )}
        </aside>

        <section className="card leaderboard-main">
          <div className="spread">
            <div>
              <span className="eyebrow">CURRENT BOARD</span>
              <h2>{selectedLift?.display_name ?? "Leaderboard"}</h2>
            </div>
            <Award size={21} />
          </div>

          <div className="leaderboard-controls">
            <div className="range-tabs">
              {(["friends", "platform"] as const).map((value) => (
                <button
                  className={scope === value ? "selected" : ""}
                  aria-pressed={scope === value}
                  key={value}
                  onClick={() => setScope(value)}
                >
                  {value === "friends" ? "Friends" : "Platform"}
                </button>
              ))}
            </div>

            <div className="range-tabs">
              {(["absolute", "relative", "growth"] as const).map((value) => (
                <button
                  className={metric === value ? "selected" : ""}
                  aria-pressed={metric === value}
                  key={value}
                  onClick={() => setMetric(value)}
                >
                  {value === "growth"
                    ? "90d Growth"
                    : value[0].toUpperCase() + value.slice(1)}
                </button>
              ))}
            </div>

            {scope === "platform" && (
              <label>
                Show
                <select
                  aria-label="Show"
                  value={limit}
                  onChange={(event) =>
                    setLimit(Number(event.target.value) as Limit)
                  }
                >
                  <option value={25}>Top 25</option>
                  <option value={100}>Top 100</option>
                  <option value={500}>Top 500</option>
                </select>
              </label>
            )}
          </div>

          {selectedLift?.machine_variability_note && (
            <p className="fine machine-note">
              Machine resistance can vary by brand, pulley design, and setup.
              Treat this ranking as a social comparison rather than a universal
              mechanical equivalence.
            </p>
          )}

          {selectedLift?.exercise_id === "weighted-pull-up" && (
            <p className="fine">
              Weighted Pull-up uses estimated total-system load: bodyweight +
              added load. A recent bodyweight measurement is required.
            </p>
          )}

          {selectedLift?.exercise_id === "dumbbell-bench-press" && (
            <p className="fine">
              Dumbbell scores use the weight of one dumbbell, never both
              combined.
            </p>
          )}
          <p role="alert">{error}</p>
          <button
            disabled={loading || !exerciseId}
            onClick={() => void loadLeaderboard()}
          >
            Refresh rankings
          </button>

          {loading ? (
            <p className="fine">Loading rankings…</p>
          ) : rows.length === 0 ? (
            <div className="empty">
              <UsersRound size={30} />
              <p>No eligible scores yet.</p>
              <small>
                Rankings require opted-in users with a valid benchmark score.
              </small>
            </div>
          ) : (
            <>
              <div className="leaderboard-meta">
                <span>{cohortSize.toLocaleString()} eligible athletes</span>
                <span>
                  {metric === "absolute"
                    ? "Estimated 1RM"
                    : metric === "relative"
                      ? "e1RM ÷ bodyweight"
                      : "First → latest eligible 90-day session"}
                </span>
              </div>

              <ol className="leaderboard-list">
                {rows.map((row) => (
                  <li key={`${row.rank_position}-${row.alias}`}>
                    <strong className="leaderboard-rank">
                      #{row.rank_position}
                    </strong>
                    <div className="leaderboard-alias">
                      <span>{row.alias}</span>
                    </div>
                    <strong>{scoreLabel(row)}</strong>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      </div>

      <section className="card leaderboard-method">
        <Dumbbell className="section-icon" />
        <h2>How ranking works</h2>
        <p>
          Absolute and relative boards use the athlete's best qualifying
          estimated 1RM for this exact benchmark movement. Growth compares the
          first and latest qualifying session inside the last 90 days.
        </p>
        <p className="fine">
          Friends and platform boards include only users who opted into social
          comparisons and separately consented to named scores. Scores come from
          self-reported training; they are not independently verified. Raw
          histories are private, but displaying absolute and relative scores can
          reveal approximate bodyweight.
        </p>
      </section>
    </>
  );
}
