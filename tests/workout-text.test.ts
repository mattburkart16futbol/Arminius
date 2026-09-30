import { expect, it } from "vitest";
import { parseWorkoutText, workoutTextDrafts } from "../src/lib/workout-text";
import { kgPerLb } from "../src/lib/workout";

it("parses mixed units and repeats without doubling dumbbell weights", () => {
  const result = parseWorkoutText(
    "Bench: 135 lb x 10, 60 kg × 8\nDB shoulder press: 3 sets of 10 at 40 lb",
    "metric",
  );
  expect(result.errors).toEqual([]);
  expect(result.lifts[0].sets).toEqual([
    { weight_kg: 135 * kgPerLb, reps: 10 },
    { weight_kg: 60, reps: 8 },
  ]);
  expect(result.lifts[1].sets).toHaveLength(3);
  expect(result.lifts[1].sets[0].weight_kg).toBe(40 * kgPerLb);
  const drafts = workoutTextDrafts(result.lifts);
  expect(
    drafts.flatMap((l) => l.sets).every((s) => s.completed_at === null),
  ).toBe(true);
  expect(new Set(drafts.flatMap((l) => l.sets.map((s) => s.id))).size).toBe(5);
});

it("uses explicit default units and keeps bodyweight separate from external load", () => {
  expect(
    parseWorkoutText("bench: 100 x 5", "imperial").lifts[0].sets[0].weight_kg,
  ).toBe(100 * kgPerLb);
  expect(
    parseWorkoutText("Push-up: bodyweight x 10", "metric").lifts[0].sets[0]
      .weight_kg,
  ).toBe(0);
  expect(
    parseWorkoutText("bench: bodyweight x 10", "metric").errors.length,
  ).toBeGreaterThan(0);
});

it.each([
  "bench: 100 x 5\nMystery lift: 40 x 10",
  "press: 40 x 10",
  "bench: 3 plates x 10",
  "bench: 100 x 10 then 8",
  "bench: -10 x 5",
  "bench: 100 x 2.5",
  "bench: 101 sets of 5 at 10",
  "bench: 100000 kg x 5",
  "bench: 100 x 5,",
  "bench: 100 x 5 warmup",
  "bench: 100 x 5 RPE 8",
  "Plan tomorrow bench: 100 x 5",
  "; ;",
  "",
])(
  "rejects unsupported or ambiguous input without importing a partial workout: %s",
  (text) => {
    const result = parseWorkoutText(text, "metric");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.lifts).toEqual([]);
  },
);

it("parses the reported workout and preserves stack and single dumbbell weights", () => {
  const result = parseWorkoutText(
    "Incline bench press: 4 sets of 135x7\nSingle arm cable tricep pressdown: 4 sets of 50x7\nChest jackhammer: 4 sets of 195x7",
    "imperial",
  );
  expect(result.errors).toEqual([]);
  expect(result.lifts.map((l) => l.sets.length)).toEqual([4, 4, 4]);
  expect(result.lifts[2].exercise_id).toBe("cable-jackhammer-pushdown");
  expect(result.lifts[1].sets[0]).toEqual({ weight_kg: 50 * kgPerLb, reps: 7 });
});
it("requires an explicit choice for unknown names", () => {
  expect(parseWorkoutText("My chest press: 40x10", "metric").lifts).toEqual([]);
  expect(
    parseWorkoutText("My chest press: 40x10", "metric", {
      0: "barbell-bench-press",
    }).lifts[0].exercise_id,
  ).toBe("barbell-bench-press");
  expect(
    parseWorkoutText("My chest press: 40x10", "metric", { 0: "made-up" }).lifts,
  ).toEqual([]);
});
