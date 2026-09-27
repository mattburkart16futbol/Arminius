import { strengthEstimate } from "./strength";
import { isCountedSet, type AnalyticsDataset } from "./analytics";

export type BodyMetric = {
  id?: string;
  measured_at: string;
  weight_kg: number | null;
};

export type RelativeStrengthPoint = {
  workoutId: string;
  startedAt: string;
  e1rmKg: number;
  bodyweightKg: number;
  ratio: number;
};

const MAX_BODYWEIGHT_AGE_DAYS = 90;

function latestEligibleBodyweight(measuredAt: string, metrics: BodyMetric[]) {
  const workoutMs = new Date(measuredAt).getTime();
  const minMs = workoutMs - MAX_BODYWEIGHT_AGE_DAYS * 24 * 60 * 60 * 1000;

  return (
    metrics
      .filter((metric) => {
        if (
          !metric.weight_kg ||
          !Number.isFinite(metric.weight_kg) ||
          metric.weight_kg <= 0
        )
          return false;
        const measurementMs = new Date(metric.measured_at).getTime();
        return measurementMs <= workoutMs && measurementMs >= minMs;
      })
      .sort(
        (a, b) =>
          new Date(b.measured_at).getTime() -
            new Date(a.measured_at).getTime() ||
          (b.id ?? "").localeCompare(a.id ?? ""),
      )[0]?.weight_kg ?? null
  );
}

export function relativeStrengthTrend(
  dataset: AnalyticsDataset,
  bodyMetrics: BodyMetric[],
  exerciseId: string,
): RelativeStrengthPoint[] {
  const workouts = new Map(
    dataset.workouts.map((workout) => [workout.id, workout]),
  );
  const points: RelativeStrengthPoint[] = [];

  for (const workoutExercise of dataset.workoutExercises) {
    if (workoutExercise.exercise_id !== exerciseId) continue;
    const workout = workouts.get(workoutExercise.workout_id);
    if (!workout?.ended_at) continue;

    const bodyweightKg = latestEligibleBodyweight(
      workout.started_at,
      bodyMetrics,
    );
    if (!bodyweightKg) continue;

    const estimates = dataset.sets
      .filter(
        (set) =>
          set.workout_exercise_id === workoutExercise.id && isCountedSet(set),
      )
      .map((set) => strengthEstimate(set, exerciseId, bodyweightKg))
      .filter((value): value is number => value !== null);

    if (estimates.length === 0) continue;
    const e1rmKg = Math.max(...estimates);

    points.push({
      workoutId: workout.id,
      startedAt: workout.started_at,
      e1rmKg,
      bodyweightKg,
      ratio: e1rmKg / bodyweightKg,
    });
  }

  const unique = new Map<string, RelativeStrengthPoint>();
  for (const p of points)
    if (p.e1rmKg > (unique.get(p.workoutId)?.e1rmKg ?? 0))
      unique.set(p.workoutId, p);
  return [...unique.values()].sort(
    (a, b) =>
      a.startedAt.localeCompare(b.startedAt) ||
      a.workoutId.localeCompare(b.workoutId),
  );
}

export function relativeStrengthSummary(
  dataset: AnalyticsDataset,
  bodyMetrics: BodyMetric[],
  exerciseId: string,
) {
  const trend = relativeStrengthTrend(dataset, bodyMetrics, exerciseId);
  if (trend.length === 0) {
    return {
      trend,
      latest: null,
      best: null,
      changeFromFirst: null,
    };
  }

  const latest = trend[trend.length - 1];
  const best = trend.reduce((current, point) =>
    point.ratio > current.ratio ? point : current,
  );
  const first = trend[0];

  return {
    trend,
    latest,
    best,
    changeFromFirst:
      trend.length > 1 && first.ratio > 0
        ? (latest.ratio - first.ratio) / first.ratio
        : null,
  };
}
