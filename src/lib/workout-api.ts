import { supabase } from "./supabase";
import type { WorkoutEntry, LiftEntry, SetEntry } from "./workout";
export const workoutColumns = "id,name,started_at,ended_at,revision";
export const setColumns =
  "id,workout_exercise_id,position,kind,reps,weight_kg,duration_seconds,distance_m,rpe,rir,completed_at";
export type WorkoutRow = Omit<WorkoutEntry, "exercises">;
export type LiftRow = Omit<LiftEntry, "sets"> & {
  workout_id: string;
  position: number;
};
export type SetRow = SetEntry & {
  workout_exercise_id: string;
  position: number;
};
// Bound IN clauses and paginate child records, avoiding silent API row-limit truncation.
export async function children<T>(
  table: "sets" | "workout_exercises" | "meal_items",
  column: string,
  ids: string[],
  select: string,
): Promise<T[]> {
  if (!supabase) return [];
  const rows: T[] = [];
  for (let chunk = 0; chunk < ids.length; chunk += 50) {
    for (let from = 0; ; from += 500) {
      const result = await supabase
        .from(table)
        .select(select)
        .in(column, ids.slice(chunk, chunk + 50))
        .order("id")
        .range(from, from + 499);
      if (result.error) throw result.error;
      const page = result.data as unknown as T[];
      rows.push(...page);
      if (page.length < 500) break;
    }
  }
  return rows;
}
export async function loadDetails(rows: WorkoutRow[]): Promise<WorkoutEntry[]> {
  const lifts = await children<LiftRow>(
    "workout_exercises",
    "workout_id",
    rows.map((w) => w.id),
    "id,workout_id,exercise_id,position",
  );
  const sets = await children<SetRow>(
    "sets",
    "workout_exercise_id",
    lifts.map((l) => l.id),
    setColumns,
  );
  return rows.map((w) => ({
    ...w,
    exercises: lifts
      .filter((l) => l.workout_id === w.id)
      .sort((a, b) => a.position - b.position)
      .map((l) => ({
        ...l,
        sets: sets
          .filter((s) => s.workout_exercise_id === l.id)
          .sort((a, b) => a.position - b.position),
      })),
  }));
}
export async function saveWorkout(
  workout: WorkoutEntry,
  finish: boolean,
  requestId: string,
) {
  if (!supabase) throw new Error("Connect Supabase to save.");
  const { data, error } = await supabase.rpc("save_workout", {
    p_id: workout.id,
    p_revision: workout.revision,
    p_name: workout.name.trim(),
    p_exercises: workout.exercises,
    p_finish: finish,
    p_request_id: requestId,
  });
  if (error) throw error;
  return data as {
    revision: number;
    ended_at: string | null;
    started_at: string;
  };
}
export function workoutError(error: unknown) {
  const e = error as { code?: string; message?: string };
  if (
    e.code === "PGRST202" ||
    e.code === "42703" ||
    e.message?.includes("schema cache")
  )
    return "Database update needed. Apply the workout update SQL in Supabase, then reload. Your edits remain here.";
  if (e.code === "40001")
    return "This workout changed in another tab. Your edits remain here. Reload saved data to get the latest version.";
  if (e.code === "23505")
    return "You already have an active workout, or this save conflicts with another change. Reload saved data to continue.";
  return "Unable to save or load workouts. Check your connection and try again. Unsaved edits remain here.";
}
