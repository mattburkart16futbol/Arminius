import { describe, expect, it } from "vitest";
import {
  relativeStrengthSummary,
  relativeStrengthTrend,
} from "../src/lib/relativeStrength";
import type { AnalyticsDataset } from "../src/lib/analytics";

const dataset: AnalyticsDataset = {
  workouts: [
    {
      id: "w1",
      name: "Squat",
      started_at: "2026-08-01T18:00:00Z",
      ended_at: "2026-08-01T19:00:00Z",
    },
    {
      id: "w2",
      name: "Squat",
      started_at: "2026-09-01T18:00:00Z",
      ended_at: "2026-09-01T19:00:00Z",
    },
  ],
  workoutExercises: [
    {
      id: "we1",
      workout_id: "w1",
      exercise_id: "barbell-back-squat",
      position: 0,
    },
    {
      id: "we2",
      workout_id: "w2",
      exercise_id: "barbell-back-squat",
      position: 0,
    },
  ],
  sets: [
    {
      id: "s1",
      workout_exercise_id: "we1",
      position: 0,
      kind: "working",
      reps: 5,
      weight_kg: 100,
      rpe: 8,
      rir: 2,
      completed_at: "2026-08-01T18:10:00Z",
    },
    {
      id: "s2",
      workout_exercise_id: "we2",
      position: 0,
      kind: "working",
      reps: 5,
      weight_kg: 110,
      rpe: 8,
      rir: 2,
      completed_at: "2026-09-01T18:10:00Z",
    },
  ],
};

describe("bodyweight-relative strength", () => {
  it("uses the latest bodyweight measured on or before each workout", () => {
    const trend = relativeStrengthTrend(
      dataset,
      [
        { measured_at: "2026-07-25T12:00:00Z", weight_kg: 80 },
        { measured_at: "2026-08-25T12:00:00Z", weight_kg: 82 },
      ],
      "barbell-back-squat",
    );

    expect(trend).toHaveLength(2);
    expect(trend[0].bodyweightKg).toBe(80);
    expect(trend[1].bodyweightKg).toBe(82);
    expect(trend[1].ratio).toBeGreaterThan(trend[0].ratio);
  });

  it("refuses stale bodyweight measurements older than 90 days", () => {
    const trend = relativeStrengthTrend(
      dataset,
      [{ measured_at: "2025-01-01T12:00:00Z", weight_kg: 80 }],
      "barbell-back-squat",
    );
    expect(trend).toEqual([]);
  });

  it("summarizes best, latest, and change without inventing tiers", () => {
    const summary = relativeStrengthSummary(
      dataset,
      [{ measured_at: "2026-07-25T12:00:00Z", weight_kg: 80 }],
      "barbell-back-squat",
    );
    expect(summary.latest).not.toBeNull();
    expect(summary.best).not.toBeNull();
    expect(summary.changeFromFirst).not.toBeNull();
  });
});
