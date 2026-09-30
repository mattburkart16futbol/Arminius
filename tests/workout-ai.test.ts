import { expect, it } from "vitest";
import {
  validateWorkoutAI,
  workoutPrompt,
  workoutAINameChoices,
} from "../src/lib/workout-ai";
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

it("keeps the real model's unknown incline ID unresolved until the user selects a variation", () => {
  const raw = JSON.stringify({
    lines: [{ exercise_id: "incline-bench", sets: "4 sets of 7 at 135 lb" }],
    questions: [],
  });
  expect(validateWorkoutAI(raw, "metric").lifts).toEqual([]);
  expect(workoutAINameChoices(raw)[0].name).toBe("Unmatched incline bench");
  const reviewed = validateWorkoutAI(raw, "metric", {
    0: "incline-barbell-bench-press",
  });
  expect(reviewed.errors).toEqual([]);
  expect(reviewed.lifts[0].sets).toHaveLength(4);
});
