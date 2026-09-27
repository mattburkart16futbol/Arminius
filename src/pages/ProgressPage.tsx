import { Link } from "react-router-dom";
import { StrengthMetricsPanel } from "../components/StrengthMetricsPanel";
import {
  children,
  setColumns,
  type LiftRow,
  type SetRow,
} from "../lib/workout-api";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  Activity,
  Award,
  ChartNoAxesCombined,
  Dumbbell,
  Scale,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { type MuscleId } from "../components/muscle-map/model";
import { InteractiveMuscleHeatmap } from "../components/muscle-map/InteractiveMuscleHeatmap";
import {
  exerciseE1rmTrend,
  exerciseSummaries,
  muscleExerciseContributions,
  muscleWorkloads,
  normalizeMuscleWorkloads,
  personalBests,
  summarizeDataset,
  type AnalyticsDataset,
  type AnalyticsWorkout,
} from "../lib/analytics";
import { supabase } from "../lib/supabase";

type UnitSystem = "metric" | "imperial";
type RangeDays = 30 | 90 | 365;

const KG_PER_LB = 0.45359237;

const muscleLabels: Record<MuscleId, string> = {
  chest: "Chest",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  core: "Core",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  calves: "Calves",
  lats: "Lats",
  upper_back: "Upper back",
  lower_back: "Lower back",
};

function displayLoad(kg: number, units: UnitSystem) {
  return units === "imperial" ? kg / KG_PER_LB : kg;
}

function formatLoad(kg: number | null, units: UnitSystem, digits = 0) {
  if (kg === null) return "—";
  return `${displayLoad(kg, units).toFixed(digits)} ${units === "imperial" ? "lb" : "kg"}`;
}

function formatVolume(kg: number, units: UnitSystem) {
  const converted = displayLoad(kg, units);
  return `${Math.round(converted).toLocaleString()} ${units === "imperial" ? "lb" : "kg"}`;
}

export function ProgressPage() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const generation = useRef(0);
  const [capped, setCapped] = useState(false);
  const [rangeDays, setRangeDays] = useState<RangeDays>(90);
  const [dataset, setDataset] = useState<AnalyticsDataset>({
    workouts: [],
    workoutExercises: [],
    sets: [],
  });
  const [unitSystem, setUnitSystem] = useState<UnitSystem>("metric");
  const [selectedExerciseId, setSelectedExerciseId] = useState("");
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleId>("quads");
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
      const since = new Date(
        Date.now() - rangeDays * 24 * 60 * 60 * 1000,
      ).toISOString();

      const [profileResult, workoutResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("unit_system")
          .eq("id", userId)
          .single(),
        supabase
          .from("workouts")
          .select("id,name,started_at,ended_at")
          .eq("user_id", userId)
          .not("ended_at", "is", null)
          .gte("started_at", since)
          .order("started_at", { ascending: false })
          .order("id")
          .limit(251),
      ]);

      if (profileResult.error) throw profileResult.error;
      if (workoutResult.error) throw workoutResult.error;

      if (token !== generation.current) return;
      setCapped((workoutResult.data?.length ?? 0) > 250);
      setUnitSystem(
        profileResult.data.unit_system === "imperial" ? "imperial" : "metric",
      );

      const workouts = (workoutResult.data ?? []).slice(
        0,
        250,
      ) as AnalyticsWorkout[];
      const workoutIds = workouts.map((workout) => workout.id);

      if (workoutIds.length === 0) {
        setDataset({ workouts: [], workoutExercises: [], sets: [] });
        return;
      }

      const workoutExercises = await children<LiftRow>(
        "workout_exercises",
        "workout_id",
        workoutIds,
        "id,workout_id,exercise_id,position",
      );
      const sets = await children<SetRow>(
        "sets",
        "workout_exercise_id",
        workoutExercises.map((e) => e.id),
        setColumns,
      );
      if (token !== generation.current) return;
      setDataset({ workouts, workoutExercises, sets });
    } catch {
      if (token === generation.current) {
        setDataset({ workouts: [], workoutExercises: [], sets: [] });
        setError(
          "Unable to load your training analytics. Check your connection and the database update, then retry.",
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

  const totals = useMemo(() => summarizeDataset(dataset), [dataset]);
  const summaries = useMemo(() => exerciseSummaries(dataset), [dataset]);
  const muscles = useMemo(() => muscleWorkloads(dataset), [dataset]);
  const bests = useMemo(() => personalBests(dataset), [dataset]);

  useEffect(() => {
    if (!selectedExerciseId && summaries[0]) {
      setSelectedExerciseId(summaries[0].exerciseId);
    }
    if (
      selectedExerciseId &&
      !summaries.some((summary) => summary.exerciseId === selectedExerciseId)
    ) {
      setSelectedExerciseId(summaries[0]?.exerciseId ?? "");
    }
  }, [selectedExerciseId, summaries]);

  const selectedSummary = summaries.find(
    (summary) => summary.exerciseId === selectedExerciseId,
  );
  const trend = selectedExerciseId
    ? exerciseE1rmTrend(dataset, selectedExerciseId)
    : [];
  const maxTrend = Math.max(0, ...trend.map((point) => point.valueKg));
  const maxMappedSets = Math.max(
    0,
    ...muscles.map((muscle) => muscle.mappedSets),
  );
  const heatmapIntensities = normalizeMuscleWorkloads(muscles);
  const selectedMuscleWorkload = muscles.find(
    (muscle) => muscle.muscleId === selectedMuscle,
  );
  const selectedMuscleExercises = muscleExerciseContributions(
    dataset,
    selectedMuscle,
  );

  if (loading) {
    return (
      <section className="card" role="status">
        Building your training picture…
      </section>
    );
  }

  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">PLAY THE LONG GAME</p>
        <h1>Your training, measured.</h1>
        <p>
          Your completed training, with clear measures of strength and workload.
        </p>
      </div>

      <Link className="text-link" to="/leaderboards">
        Benchmark leaderboards
      </Link>
      <div className="analytics-toolbar">
        <div className="range-tabs" aria-label="Analytics range">
          {([30, 90, 365] as const).map((days) => (
            <button
              className={rangeDays === days ? "selected" : ""}
              aria-pressed={rangeDays === days}
              key={days}
              onClick={() => setRangeDays(days)}
            >
              {days === 365 ? "1 year" : `${days} days`}
            </button>
          ))}
        </div>
      </div>

      <p role="alert">{error}</p>
      {error && <button onClick={() => void load()}>Retry analytics</button>}
      {capped && (
        <p role="status">
          Showing your latest 250 completed sessions in this period. Earlier
          sessions are excluded from these totals.
        </p>
      )}

      <div className="analytics-kpis">
        <article className="metric-card">
          <Activity size={18} />
          <span>Sessions</span>
          <strong>{totals.sessions}</strong>
        </article>
        <article className="metric-card">
          <Dumbbell size={18} />
          <span>Working sets</span>
          <strong>{totals.completedSets}</strong>
        </article>
        <article className="metric-card">
          <ChartNoAxesCombined size={18} />
          <span>Logged-load volume</span>
          <strong>{formatVolume(totals.totalVolumeKg, unitSystem)}</strong>
        </article>
        <article className="metric-card">
          <Award size={18} />
          <span>Tracked bests</span>
          <strong>{bests.length}</strong>
        </article>
      </div>

      {totals.sessions === 0 ? (
        <section className="card">
          <div className="empty">
            <p>No completed workouts in this period.</p>
            <small>Finish a workout and its analytics will appear here.</small>
          </div>
        </section>
      ) : (
        <div className="analytics-grid">
          <section className="card">
            <div className="spread">
              <h2>Exercise progress</h2>
              <span className="badge">Epley e1RM</span>
            </div>
            <label className="analytics-select">
              Exercise
              <select
                value={selectedExerciseId}
                onChange={(event) => setSelectedExerciseId(event.target.value)}
              >
                {summaries.map((summary) => (
                  <option key={summary.exerciseId} value={summary.exerciseId}>
                    {summary.name}
                  </option>
                ))}
              </select>
            </label>

            {selectedSummary && (
              <div className="exercise-metrics">
                <div>
                  <span>Sessions</span>
                  <strong>{selectedSummary.sessions}</strong>
                </div>
                <div>
                  <span>Best load</span>
                  <strong>
                    {formatLoad(selectedSummary.bestWeightKg, unitSystem)}
                  </strong>
                </div>
                <div>
                  <span>Best e1RM</span>
                  <strong>
                    {formatLoad(selectedSummary.bestE1rmKg, unitSystem)}
                  </strong>
                </div>
                <div>
                  <span>Volume</span>
                  <strong>
                    {formatVolume(selectedSummary.totalVolumeKg, unitSystem)}
                  </strong>
                </div>
              </div>
            )}

            <div
              className="trend-chart"
              aria-label="Estimated one rep max trend"
            >
              {trend.length === 0 ? (
                <div className="empty">
                  <p>No e1RM trend yet.</p>
                  <small>
                    Log 1–12 reps for an eligible strength or benchmark lift to
                    create one.
                  </small>
                </div>
              ) : (
                trend.map((point) => (
                  <div
                    className="trend-row"
                    key={`${point.workoutId}-${point.startedAt}`}
                  >
                    <time dateTime={point.startedAt}>
                      {new Date(point.startedAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </time>
                    <div className="trend-track">
                      <i
                        style={{
                          width: `${maxTrend ? (point.valueKg / maxTrend) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <strong>{formatLoad(point.valueKg, unitSystem, 1)}</strong>
                  </div>
                ))
              )}
            </div>
            <p className="fine">
              e1RM uses the Epley formula for eligible strength and benchmark
              lifts with 1–12 completed reps. Assistance, timed work, and other
              ineligible lifts have no estimate. It is an estimate, not a
              measured max.
            </p>
          </section>

          <StrengthMetricsPanel
            dataset={dataset}
            exerciseId={selectedExerciseId}
            unitSystem={unitSystem}
          />
          <section className="card heatmap-card">
            <div className="spread">
              <h2>Muscle heatmap</h2>
              <span className="badge">Relative workload</span>
            </div>

            <div className="heatmap-layout">
              <div className="heatmap-pair">
                {(["front", "back"] as const).map((view) => (
                  <figure key={view}>
                    <InteractiveMuscleHeatmap
                      view={view}
                      intensities={heatmapIntensities}
                      selectedMuscle={selectedMuscle}
                      onSelectMuscle={setSelectedMuscle}
                    />
                    <figcaption>{view}</figcaption>
                  </figure>
                ))}
              </div>

              <div className="muscle-detail">
                <span className="eyebrow">SELECTED MUSCLE</span>
                <h3>{muscleLabels[selectedMuscle]}</h3>
                <div className="muscle-detail-kpis">
                  <div>
                    <span>Mapped sets</span>
                    <strong>
                      {selectedMuscleWorkload?.mappedSets.toFixed(1) ?? "0.0"}
                    </strong>
                  </div>
                  <div>
                    <span>Mapped volume</span>
                    <strong>
                      {formatVolume(
                        selectedMuscleWorkload?.mappedVolumeKg ?? 0,
                        unitSystem,
                      )}
                    </strong>
                  </div>
                </div>

                <h4>Contributing exercises</h4>
                {selectedMuscleExercises.length === 0 ? (
                  <p className="fine">
                    No mapped work for this muscle in the selected period.
                  </p>
                ) : (
                  <div className="muscle-contributors">
                    {selectedMuscleExercises.slice(0, 6).map((exercise) => (
                      <div className="history-row" key={exercise.exerciseId}>
                        <div>
                          <strong>{exercise.name}</strong>
                          <small>
                            {exercise.mappedSets.toFixed(1)} mapped sets
                          </small>
                        </div>
                        <span>
                          {formatVolume(exercise.mappedVolumeKg, unitSystem)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="heat-legend" aria-label="Relative workload legend">
              <span>
                <i className="heat-none" /> None
              </span>
              <span>
                <i className="heat-low" /> Lower
              </span>
              <span>
                <i className="heat-medium" /> Medium
              </span>
              <span>
                <i className="heat-high" /> Higher
              </span>
            </div>

            <div className="muscle-workload-list compact-workload-list">
              {muscles.map((muscle) => (
                <button
                  className={
                    muscle.muscleId === selectedMuscle
                      ? "muscle-workload-button selected"
                      : "muscle-workload-button"
                  }
                  key={muscle.muscleId}
                  onClick={() => setSelectedMuscle(muscle.muscleId)}
                >
                  <div className="spread">
                    <strong>{muscleLabels[muscle.muscleId]}</strong>
                    <span>{muscle.mappedSets.toFixed(1)}</span>
                  </div>
                  <div className="workload-track">
                    <i
                      style={{
                        width: `${
                          maxMappedSets
                            ? (muscle.mappedSets / maxMappedSets) * 100
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </button>
              ))}
            </div>

            <p className="fine">
              Color shows relative mapped workload inside this selected time
              range. The highest workload is always 100%, even in a light week.
              Red means “more relative work,” not muscle damage, activation,
              soreness, recovery status, or a medical measurement.
            </p>
          </section>

          <section className="card">
            <div className="spread">
              <h2>Current bests</h2>
              <span className="badge">
                {rangeDays === 365 ? "1 year" : `${rangeDays} days`}
              </span>
            </div>
            <div className="best-list">
              {bests.slice(0, 12).map((best) => (
                <div
                  className="history-row"
                  key={`${best.exerciseId}-${best.metric}`}
                >
                  <div>
                    <strong>{best.exerciseName}</strong>
                    <small>
                      {best.metric === "e1rm"
                        ? "Estimated 1RM"
                        : best.metric === "weight"
                          ? "Heaviest load"
                          : "Most reps"}
                    </small>
                  </div>
                  <span>
                    {best.unit === "kg"
                      ? formatLoad(
                          best.value,
                          unitSystem,
                          best.metric === "e1rm" ? 1 : 0,
                        )
                      : `${Math.round(best.value)} reps`}
                  </span>
                </div>
              ))}
            </div>
            <p className="fine">
              These bests reflect the selected period. Social comparisons are
              coming later.
            </p>
          </section>

          <section className="card">
            <Scale className="section-icon" />
            <h2>How Arminius calculates this</h2>
            <p>
              Warm-up sets are excluded from training totals. Logged-load volume
              is logged weight × reps. Dumbbell volume uses the individual
              dumbbell weight and is not doubled. Assistance is excluded from
              load-volume and load-best calculations. Timed/distance sets count
              toward workload but not rep volume. Bodyweight is never guessed.
              Exercise-muscle workload uses the fixed mapping stored in the
              catalog.
            </p>
            <p className="fine">
              That keeps the first analytics layer explainable, reproducible,
              and essentially free to compute.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
