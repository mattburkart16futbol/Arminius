import type { AnalyticsSet } from "./analytics";
import { tracking } from "./workout";
export const benchmarkIds = [
  "barbell-bench-press",
  "dumbbell-bench-press",
  "barbell-back-squat",
  "conventional-deadlift",
  "leg-press",
  "barbell-hip-thrust",
  "barbell-overhead-press",
  "weighted-pull-up",
  "lat-pulldown",
  "seated-cable-row",
];
export function strengthEstimate(
  set: AnalyticsSet,
  exerciseId: string,
  bodyweightKg: number | null = null,
) {
  const info = tracking[exerciseId];
  if (
    !info ||
    info.mode !== "reps" ||
    info.load === "assistance" ||
    (!info.e1rm && !benchmarkIds.includes(exerciseId)) ||
    !set.completed_at ||
    set.kind === "warmup" ||
    !set.reps ||
    set.reps < 1 ||
    set.reps > 12 ||
    !Number.isInteger(set.reps) ||
    !set.weight_kg ||
    !Number.isFinite(set.weight_kg) ||
    set.weight_kg <= 0 ||
    set.weight_kg > 2000
  )
    return null;
  if (
    exerciseId === "weighted-pull-up" &&
    (!bodyweightKg || !Number.isFinite(bodyweightKg) || bodyweightKg <= 0)
  )
    return null;
  return (
    (set.weight_kg + (exerciseId === "weighted-pull-up" ? bodyweightKg! : 0)) *
    (1 + set.reps / 30)
  );
}
