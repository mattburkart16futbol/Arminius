import { expect, it } from "vitest";
import { validateWorkoutAI, workoutPrompt } from "../src/lib/workout-ai";
it("validates model drafts with catalog and set bounds", () => {
  const result = validateWorkoutAI(
    JSON.stringify({
      lines: [
        { exercise_id: "barbell-bench-press", sets: "4 sets of 7 at 135 lb" },
      ],
      questions: [],
    }),
    "metric",
  );
  expect(result.errors).toEqual([]);
  expect(result.lifts[0].sets).toHaveLength(4);
});
it.each([
  {},
  { lines: [], questions: [] },
  { lines: [{ exercise_id: "fake", sets: "40 kg x 8" }], questions: [] },
  {
    lines: [{ exercise_id: "barbell-bench-press", sets: "10000 kg x 8" }],
    questions: [],
  },
  {
    lines: [
      { exercise_id: "barbell-bench-press", sets: "40 kg x 8; Bench: 50 x 5" },
    ],
    questions: [],
  },
  {
    lines: [{ exercise_id: "barbell-bench-press", sets: "40 kg x 8" }],
    questions: ["Which variation?"],
  },
  { lines: [null], questions: [] },
  { lines: [], questions: [42] },
])("rejects incomplete, uncertain or invalid model output", (value) => {
  const result = validateWorkoutAI(JSON.stringify(value), "metric");
  expect(result.lifts).toEqual([]);
  expect(result.errors.length).toBeGreaterThan(0);
});
it("bounds model input and rejects malformed output", () => {
  expect(() => workoutPrompt("x".repeat(1501), "metric")).toThrow();
  expect(validateWorkoutAI("not JSON", "metric").lifts).toEqual([]);
});
