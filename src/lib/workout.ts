import catalog from "../data/exercises.json";
import metadata from "../data/exercise-tracking.json";
export type Unit = "metric" | "imperial";
export type SetEntry = {
  id: string;
  kind: "warmup" | "working" | "dropset";
  reps: number | null;
  weight_kg: number | null;
  duration_seconds: number | null;
  distance_m: number | null;
  rpe: number | null;
  rir: number | null;
  completed_at: string | null;
};
export type LiftEntry = { id: string; exercise_id: string; sets: SetEntry[] };
export type WorkoutEntry = {
  id: string;
  name: string;
  started_at: string;
  ended_at: string | null;
  revision: number;
  exercises: LiftEntry[];
};
export type Tracking = {
  mode: "reps" | "time" | "distance";
  load: "external" | "per_dumbbell" | "added" | "assistance";
  category: "push" | "pull" | "legs" | "core" | "full";
  e1rm: boolean;
};
export const tracking = metadata as Record<string, Tracking>;
export const kgPerLb = 0.45359237;
export const weightLabel = (id: string) =>
  ({
    external: "Weight",
    per_dumbbell: "Weight per dumbbell",
    added: "Added weight",
    assistance: "Assistance weight",
  })[tracking[id]?.load ?? "external"];
export const exerciseName = (id: string) =>
  catalog.find((e) => e.id === id)?.name ?? id;
export function numberValue(s: string) {
  return s.trim() === "" ? null : Number(s);
}
export function displayWeight(kg: number | null, unit: Unit) {
  return kg === null
    ? ""
    : String(Number((kg / (unit === "imperial" ? kgPerLb : 1)).toFixed(3)));
}
export function newSet(previous?: SetEntry): SetEntry {
  return {
    id: crypto.randomUUID(),
    kind: previous?.kind ?? "working",
    reps: previous?.reps ?? null,
    weight_kg: previous?.weight_kg ?? null,
    duration_seconds: previous?.duration_seconds ?? null,
    distance_m: previous?.distance_m ?? null,
    rpe: null,
    rir: null,
    completed_at: null,
  };
}
export function validateWorkout(
  workout: WorkoutEntry,
  finish = false,
): string | null {
  if (!workout.name.trim() || workout.name.length > 200)
    return "Enter a workout name of 1–200 characters.";
  if (workout.exercises.length > 50)
    return "Keep each workout to 50 exercises or fewer.";
  let completed = 0;
  for (const lift of workout.exercises) {
    const info = tracking[lift.exercise_id];
    if (!info) return "Choose a catalog exercise.";
    if (lift.sets.length > 100)
      return "Keep each exercise to 100 sets or fewer.";
    for (const s of lift.sets) {
      for (const v of [
        s.reps,
        s.weight_kg,
        s.duration_seconds,
        s.distance_m,
        s.rpe,
        s.rir,
      ])
        if (v !== null && !Number.isFinite(v))
          return "Use valid numbers in every set.";
      if (s.reps !== null && (!Number.isInteger(s.reps) || s.reps < 0))
        return "Reps must be a whole number, zero or greater.";
      if (s.weight_kg !== null && (s.weight_kg < 0 || s.weight_kg > 2000))
        return "Weight must be between 0 and 2,000 kg.";
      if (s.rpe !== null && (s.rpe < 1 || s.rpe > 10))
        return "RPE must be between 1 and 10.";
      if (s.rir !== null && (s.rir < 0 || s.rir > 10))
        return "RIR must be between 0 and 10.";
      if (
        s.duration_seconds !== null &&
        (!Number.isInteger(s.duration_seconds) || s.duration_seconds <= 0)
      )
        return "Duration must be a positive whole number of seconds.";
      if (s.distance_m !== null && s.distance_m <= 0)
        return "Distance must be greater than zero.";
      if (s.completed_at) {
        completed++;
        const value =
          info.mode === "time"
            ? s.duration_seconds
            : info.mode === "distance"
              ? s.distance_m
              : s.reps;
        if (value === null || value <= 0)
          return `Enter ${info.mode === "time" ? "seconds" : info.mode === "distance" ? "metres" : "reps"} before completing ${exerciseName(lift.exercise_id)}.`;
      }
    }
  }
  return finish && !completed
    ? "Complete at least one set before finishing."
    : null;
}
