import { strengthEstimate } from "./strength";
import { tracking } from "./workout";
import catalog from "../data/exercises.json";
import type { MuscleId } from "../components/muscle-map/model";

export type AnalyticsSet = {
  id: string;
  workout_exercise_id: string;
  position: number;
  kind: "warmup" | "working" | "dropset";
  reps: number | null;
  duration_seconds?: number | null;
  distance_m?: number | null;
  weight_kg: number | null;
  rpe: number | null;
  rir: number | null;
  completed_at: string | null;
};

export type AnalyticsWorkoutExercise = {
  id: string;
  workout_id: string;
  exercise_id: string;
  position: number;
};

export type AnalyticsWorkout = {
  id: string;
  name: string;
  started_at: string;
  ended_at: string | null;
};

export type AnalyticsDataset = {
  workouts: AnalyticsWorkout[];
  workoutExercises: AnalyticsWorkoutExercise[];
  sets: AnalyticsSet[];
};

export type ExerciseSummary = {
  exerciseId: string;
  name: string;
  equipment: string;
  sessions: number;
  completedSets: number;
  totalReps: number;
  totalVolumeKg: number;
  bestWeightKg: number | null;
  bestE1rmKg: number | null;
  latestAt: string | null;
};

export type E1rmPoint = {
  workoutId: string;
  startedAt: string;
  valueKg: number;
};

export type MuscleWorkload = {
  muscleId: MuscleId;
  mappedSets: number;
  mappedVolumeKg: number;
};

export type PersonalBest = {
  exerciseId: string;
  exerciseName: string;
  metric: "weight" | "e1rm" | "reps";
  value: number;
  unit: "kg" | "reps";
  workoutId: string;
  achievedAt: string;
};

type CatalogExercise = {
  id: string;
  name: string;
  equipment: string;
  muscles: Partial<Record<MuscleId, number>>;
};

const exercises = catalog as CatalogExercise[];
const exerciseById = new Map(
  exercises.map((exercise) => [exercise.id, exercise]),
);

/**
 * "Counted" training sets are completed non-warm-up sets with positive reps.
 * Warm-ups remain visible in the log but do not inflate training analytics.
 */
export function isCountedSet(set: AnalyticsSet) {
  return Boolean(
    set.completed_at &&
    set.kind !== "warmup" &&
    ((set.reps ?? 0) > 0 ||
      (set.duration_seconds ?? 0) > 0 ||
      (set.distance_m ?? 0) > 0),
  );
}

/**
 * External-load volume only: load × reps.
 * Bodyweight itself is not guessed, and unloaded/bodyweight sets contribute 0 kg.
 */
export function setVolumeKg(set: AnalyticsSet) {
  if (!isCountedSet(set) || !set.weight_kg || set.weight_kg <= 0) return 0;
  return set.weight_kg * (set.reps ?? 0);
}

/**
 * Epley estimated 1RM. Restricted to 1–12 completed reps because high-rep
 * estimates become increasingly noisy. This estimates the logged external load,
 * so it should not be treated as total-system 1RM for weighted bodyweight work.
 */
export function estimatedOneRepMaxKg(set: AnalyticsSet) {
  if (
    !isCountedSet(set) ||
    !set.weight_kg ||
    set.weight_kg <= 0 ||
    !set.reps ||
    set.reps < 1 ||
    set.reps > 12
  ) {
    return null;
  }
  return set.weight_kg * (1 + set.reps / 30);
}

function completedDataset(dataset: AnalyticsDataset): AnalyticsDataset {
  const workouts = dataset.workouts.filter((w) => w.ended_at);
  const ids = new Set(workouts.map((w) => w.id));
  const workoutExercises = dataset.workoutExercises.filter((e) =>
    ids.has(e.workout_id),
  );
  const liftIds = new Set(workoutExercises.map((e) => e.id));
  return {
    workouts,
    workoutExercises,
    sets: dataset.sets.filter((s) => liftIds.has(s.workout_exercise_id)),
  };
}
function volumeFor(set: AnalyticsSet, exerciseId: string) {
  return tracking[exerciseId]?.load === "assistance" ||
    tracking[exerciseId]?.mode !== "reps"
    ? 0
    : setVolumeKg(set);
}
function estimateFor(set: AnalyticsSet, exerciseId: string) {
  return strengthEstimate(set, exerciseId);
}

function setsByWorkoutExercise(dataset: AnalyticsDataset) {
  const grouped = new Map<string, AnalyticsSet[]>();
  for (const set of dataset.sets) {
    const rows = grouped.get(set.workout_exercise_id) ?? [];
    rows.push(set);
    grouped.set(set.workout_exercise_id, rows);
  }
  return grouped;
}

export function summarizeDataset(dataset: AnalyticsDataset) {
  dataset = completedDataset(dataset);
  const completedWorkouts = dataset.workouts.filter(
    (workout) => workout.ended_at,
  );
  const completedSets = dataset.sets.filter(isCountedSet);
  return {
    sessions: completedWorkouts.length,
    completedSets: completedSets.length,
    totalReps: completedSets.reduce((sum, set) => sum + (set.reps ?? 0), 0),
    totalVolumeKg: completedSets.reduce(
      (sum, set) =>
        sum +
        volumeFor(
          set,
          dataset.workoutExercises.find((e) => e.id === set.workout_exercise_id)
            ?.exercise_id ?? "",
        ),
      0,
    ),
  };
}

export function exerciseSummaries(
  dataset: AnalyticsDataset,
): ExerciseSummary[] {
  dataset = completedDataset(dataset);
  const workouts = new Map(
    dataset.workouts.map((workout) => [workout.id, workout]),
  );
  const groupedSets = setsByWorkoutExercise(dataset);
  const summaries = new Map<string, ExerciseSummary>();
  const sessionKeys = new Map<string, Set<string>>();

  for (const workoutExercise of dataset.workoutExercises) {
    const workout = workouts.get(workoutExercise.workout_id);
    if (!workout?.ended_at) continue;
    const exercise = exerciseById.get(workoutExercise.exercise_id);
    if (!exercise) continue;

    if (!(groupedSets.get(workoutExercise.id) ?? []).some(isCountedSet))
      continue;
    const summary = summaries.get(exercise.id) ?? {
      exerciseId: exercise.id,
      name: exercise.name,
      equipment: exercise.equipment,
      sessions: 0,
      completedSets: 0,
      totalReps: 0,
      totalVolumeKg: 0,
      bestWeightKg: null,
      bestE1rmKg: null,
      latestAt: null,
    };

    const sessionSet = sessionKeys.get(exercise.id) ?? new Set<string>();
    sessionSet.add(workout.id);
    sessionKeys.set(exercise.id, sessionSet);

    if (!summary.latestAt || workout.started_at > summary.latestAt) {
      summary.latestAt = workout.started_at;
    }

    for (const set of groupedSets.get(workoutExercise.id) ?? []) {
      if (!isCountedSet(set)) continue;
      summary.completedSets += 1;
      summary.totalReps += set.reps ?? 0;
      summary.totalVolumeKg += volumeFor(set, exercise.id);
      if (
        tracking[exercise.id]?.load !== "assistance" &&
        set.weight_kg &&
        set.weight_kg > 0 &&
        (summary.bestWeightKg === null || set.weight_kg > summary.bestWeightKg)
      ) {
        summary.bestWeightKg = set.weight_kg;
      }
      const estimate = estimateFor(set, exercise.id);
      if (
        estimate !== null &&
        (summary.bestE1rmKg === null || estimate > summary.bestE1rmKg)
      ) {
        summary.bestE1rmKg = estimate;
      }
    }

    summaries.set(exercise.id, summary);
  }

  for (const [exerciseId, summary] of summaries) {
    summary.sessions = sessionKeys.get(exerciseId)?.size ?? 0;
  }

  return [...summaries.values()].sort((a, b) => {
    if (!a.latestAt) return 1;
    if (!b.latestAt) return -1;
    return b.latestAt.localeCompare(a.latestAt);
  });
}

export function exerciseE1rmTrend(
  dataset: AnalyticsDataset,
  exerciseId: string,
): E1rmPoint[] {
  dataset = completedDataset(dataset);
  const workouts = new Map(
    dataset.workouts.map((workout) => [workout.id, workout]),
  );
  const groupedSets = setsByWorkoutExercise(dataset);
  const points: E1rmPoint[] = [];

  for (const workoutExercise of dataset.workoutExercises) {
    if (workoutExercise.exercise_id !== exerciseId) continue;
    const workout = workouts.get(workoutExercise.workout_id);
    if (!workout?.ended_at) continue;

    const estimates = (groupedSets.get(workoutExercise.id) ?? [])
      .map((s) => estimateFor(s, exerciseId))
      .filter((value): value is number => value !== null);

    if (estimates.length > 0) {
      points.push({
        workoutId: workout.id,
        startedAt: workout.started_at,
        valueKg: Math.max(...estimates),
      });
    }
  }

  const sessions = new Map<string, E1rmPoint>();
  for (const point of points)
    if (point.valueKg > (sessions.get(point.workoutId)?.valueKg ?? 0))
      sessions.set(point.workoutId, point);
  return [...sessions.values()].sort((a, b) =>
    a.startedAt.localeCompare(b.startedAt),
  );
}

/**
 * Aggregates the existing editorial exercise-muscle mapping across completed
 * training sets. "Mapped sets" are NOT physiological effective sets:
 * a set contributes its stored involvement weight (e.g. 1.0 or 0.5).
 */
export function muscleWorkloads(dataset: AnalyticsDataset): MuscleWorkload[] {
  dataset = completedDataset(dataset);
  const groupedSets = setsByWorkoutExercise(dataset);
  const result = new Map<MuscleId, MuscleWorkload>();

  for (const workoutExercise of dataset.workoutExercises) {
    const exercise = exerciseById.get(workoutExercise.exercise_id);
    if (!exercise) continue;
    const countedSets = (groupedSets.get(workoutExercise.id) ?? []).filter(
      isCountedSet,
    );
    if (countedSets.length === 0) continue;

    for (const [muscle, involvement] of Object.entries(exercise.muscles) as [
      MuscleId,
      number,
    ][]) {
      const current = result.get(muscle) ?? {
        muscleId: muscle,
        mappedSets: 0,
        mappedVolumeKg: 0,
      };
      for (const set of countedSets) {
        current.mappedSets += involvement;
        current.mappedVolumeKg += volumeFor(set, exercise.id) * involvement;
      }
      result.set(muscle, current);
    }
  }

  return [...result.values()].sort((a, b) => b.mappedSets - a.mappedSets);
}

/**
 * Returns all-time best performances within the supplied dataset.
 * Persistence to the protected personal_records table is deliberately NOT done
 * in the browser; a trusted server function can materialize verified PRs later.
 */
export function personalBests(dataset: AnalyticsDataset): PersonalBest[] {
  dataset = completedDataset(dataset);
  const workouts = new Map(
    dataset.workouts.map((workout) => [workout.id, workout]),
  );
  const bests = new Map<string, PersonalBest>();

  for (const workoutExercise of dataset.workoutExercises) {
    const workout = workouts.get(workoutExercise.workout_id);
    const exercise = exerciseById.get(workoutExercise.exercise_id);
    if (!workout?.ended_at || !exercise) continue;

    for (const set of dataset.sets.filter(
      (candidate) => candidate.workout_exercise_id === workoutExercise.id,
    )) {
      if (!isCountedSet(set)) continue;
      const metrics: PersonalBest[] = [];

      if (
        tracking[exercise.id]?.load !== "assistance" &&
        set.weight_kg &&
        set.weight_kg > 0
      ) {
        metrics.push({
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          metric: "weight",
          value: set.weight_kg,
          unit: "kg",
          workoutId: workout.id,
          achievedAt: workout.started_at,
        });
      }

      const estimate = estimateFor(set, exercise.id);
      if (estimate !== null) {
        metrics.push({
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          metric: "e1rm",
          value: estimate,
          unit: "kg",
          workoutId: workout.id,
          achievedAt: workout.started_at,
        });
      }

      if ((set.reps ?? 0) > 0)
        metrics.push({
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          metric: "reps",
          value: set.reps ?? 0,
          unit: "reps",
          workoutId: workout.id,
          achievedAt: workout.started_at,
        });

      for (const metric of metrics) {
        const key = `${metric.exerciseId}:${metric.metric}`;
        const current = bests.get(key);
        if (!current || metric.value > current.value) bests.set(key, metric);
      }
    }
  }

  return [...bests.values()].sort((a, b) =>
    b.achievedAt.localeCompare(a.achievedAt),
  );
}

export type MuscleExerciseContribution = {
  exerciseId: string;
  name: string;
  mappedSets: number;
  mappedVolumeKg: number;
};

export function normalizeMuscleWorkloads(
  workloads: MuscleWorkload[],
): Partial<Record<MuscleId, number>> {
  const max = Math.max(0, ...workloads.map((workload) => workload.mappedSets));
  if (max <= 0) return {};
  return Object.fromEntries(
    workloads.map((workload) => [
      workload.muscleId,
      Math.max(0, Math.min(1, workload.mappedSets / max)),
    ]),
  ) as Partial<Record<MuscleId, number>>;
}

export function muscleExerciseContributions(
  dataset: AnalyticsDataset,
  muscleId: MuscleId,
): MuscleExerciseContribution[] {
  dataset = completedDataset(dataset);
  const groupedSets = setsByWorkoutExercise(dataset);
  const result = new Map<string, MuscleExerciseContribution>();

  for (const workoutExercise of dataset.workoutExercises) {
    const exercise = exerciseById.get(workoutExercise.exercise_id);
    const involvement = exercise?.muscles[muscleId];
    if (!exercise || !involvement) continue;

    const countedSets = (groupedSets.get(workoutExercise.id) ?? []).filter(
      isCountedSet,
    );
    if (countedSets.length === 0) continue;

    const current = result.get(exercise.id) ?? {
      exerciseId: exercise.id,
      name: exercise.name,
      mappedSets: 0,
      mappedVolumeKg: 0,
    };

    for (const set of countedSets) {
      current.mappedSets += involvement;
      current.mappedVolumeKg += volumeFor(set, exercise.id) * involvement;
    }

    result.set(exercise.id, current);
  }

  return [...result.values()].sort((a, b) => b.mappedSets - a.mappedSets);
}
