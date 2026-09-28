import catalog from "../data/exercises.json";
import { kgPerLb, newSet, tracking, type LiftEntry, type Unit } from "./workout";

export type ParsedLift = { exercise_id: string; sets: { weight_kg: number; reps: number }[] };
const normalize = (value: string) => value.toLowerCase().trim().replace(/[-_]/g, " ").replace(/\s+/g, " ");
const aliases: Record<string, string> = {
  bench: "barbell-bench-press",
  "bench press": "barbell-bench-press",
  "db bench": "dumbbell-bench-press",
  "db shoulder press": "dumbbell-shoulder-press",
  rdl: "hinge",
};

/** Deliberately bounded grammar. Never drop unrecognized text or infer completion. */
export function parseWorkoutText(text: string, units: Unit) {
  const lifts: ParsedLift[] = [];
  const errors: string[] = [];
  if (!text.trim() || text.length > 6000)
    return { lifts, errors: ["Enter a workout of 1–6,000 characters."] };
  const lines = text.split(/[\n;]/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return { lifts, errors: ["Enter at least one exercise and its sets."] };
  if (lines.length > 50) return { lifts, errors: ["Use at most 50 exercise lines."] };
  for (const [index, line] of lines.entries()) {
    const fail = (message: string) => errors.push(`Line ${index + 1}: ${message}`);
    const parts = line.split(":");
    if (parts.length !== 2) { fail("Separate the exercise and sets with a colon."); continue; }
    const key = normalize(parts[0]);
    const matches = catalog.filter((e) => normalize(e.name) === key || e.id === aliases[key]);
    if (matches.length !== 1) { fail(`Use a specific exercise name from the library for “${parts[0]}”.`); continue; }
    const exercise_id = matches[0].id;
    const info = tracking[exercise_id];
    if (info.mode !== "reps" || info.load === "assistance") {
      fail("Use the manual editor for timed, distance, or assisted exercises."); continue;
    }
    const sets: ParsedLift["sets"] = [];
    for (const segment of parts[1].split(",")) {
      const value = segment.trim().toLowerCase().replaceAll("×", "x");
      // Weight x reps, or N sets of R at W. Every character must match.
      const single = /^(\d+(?:\.\d+)?|bodyweight)\s*(kg|lb|lbs)?\s*x\s*(\d+)(?:\s*reps)?$/.exec(value);
      const repeated = /^(\d+)\s*sets?\s*of\s*(\d+)\s*(?:reps\s*)?at\s*(\d+(?:\.\d+)?|bodyweight)\s*(kg|lb|lbs)?$/.exec(value);
      if (!single && !repeated) { fail("Use “135 lb x 10” or “3 sets of 10 at 40 lb”. Include weight for every set."); break; }
      const count = repeated ? Number(repeated[1]) : 1;
      const reps = Number(repeated ? repeated[2] : single![3]);
      const rawWeight = repeated ? repeated[3] : single![1];
      const unit = (repeated ? repeated[4] : single![2]) || (units === "imperial" ? "lb" : "kg");
      if (rawWeight === "bodyweight" && (info.load !== "added" || (repeated ? repeated[4] : single![2]))) {
        fail("Use bodyweight only for an unweighted bodyweight exercise, without lb or kg."); break;
      }
      const weight_kg = rawWeight === "bodyweight" ? 0 : Number(rawWeight) * (unit === "kg" ? 1 : kgPerLb);
      if (count < 1 || count > 100 || reps < 1 || reps > 1000 || weight_kg > 2000 || sets.length + count > 100) {
        fail("Check the numbers: 1–100 sets, 1–1,000 reps, and at most 2,000 kg."); break;
      }
      for (let i = 0; i < count; i++) sets.push({ weight_kg, reps });
    }
    lifts.push({ exercise_id, sets });
  }
  // All-or-nothing preview prevents a partially understood workout from being added.
  return { lifts: errors.length ? [] : lifts, errors };
}

export function workoutTextDrafts(lifts: ParsedLift[]): LiftEntry[] {
  return lifts.map((lift) => ({
    id: crypto.randomUUID(), exercise_id: lift.exercise_id,
    sets: lift.sets.map((set) => ({ ...newSet(), ...set })),
  }));
}
