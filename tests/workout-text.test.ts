import { expect, it } from "vitest";
import { parseWorkoutText, workoutTextDrafts } from "../src/lib/workout-text";
import { kgPerLb } from "../src/lib/workout";

it("parses mixed units and repeats without doubling dumbbell weights", () => {
  const result = parseWorkoutText("Bench: 135 lb x 10, 60 kg × 8\nDB shoulder press: 3 sets of 10 at 40 lb", "metric");
  expect(result.errors).toEqual([]);
  expect(result.lifts[0].sets).toEqual([{weight_kg:135*kgPerLb,reps:10},{weight_kg:60,reps:8}]);
  expect(result.lifts[1].sets).toHaveLength(3);
  expect(result.lifts[1].sets[0].weight_kg).toBe(40*kgPerLb);
  const drafts = workoutTextDrafts(result.lifts);
  expect(drafts.flatMap((l) => l.sets).every((s) => s.completed_at === null)).toBe(true);
  expect(new Set(drafts.flatMap((l) => l.sets.map((s) => s.id))).size).toBe(5);
});

it("uses explicit default units and keeps bodyweight separate from external load", () => {
  expect(parseWorkoutText("bench: 100 x 5", "imperial").lifts[0].sets[0].weight_kg).toBe(100*kgPerLb);
  expect(parseWorkoutText("Push-up: bodyweight x 10", "metric").lifts[0].sets[0].weight_kg).toBe(0);
  expect(parseWorkoutText("bench: bodyweight x 10", "metric").errors.length).toBeGreaterThan(0);
});

it.each([
  "bench: 100 x 5\nMystery lift: 40 x 10", "press: 40 x 10",
  "bench: 3 plates x 10", "bench: 100 x 10 then 8",
  "bench: -10 x 5", "bench: 100 x 2.5", "bench: 101 sets of 5 at 10",
  "bench: 100000 kg x 5", "bench: 100 x 5,", "bench: 100 x 5 warmup",
  "bench: 100 x 5 RPE 8", "Plan tomorrow bench: 100 x 5", "; ;", "",
])("rejects unsupported or ambiguous input without importing a partial workout: %s", (text) => {
  const result = parseWorkoutText(text, "metric");
  expect(result.errors.length).toBeGreaterThan(0);
  expect(result.lifts).toEqual([]);
});
