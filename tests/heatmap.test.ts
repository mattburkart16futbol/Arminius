import { describe, expect, it } from "vitest";
import {
  muscleExerciseContributions,
  normalizeMuscleWorkloads,
  type AnalyticsDataset,
} from "../src/lib/analytics";

const dataset: AnalyticsDataset = {
  workouts: [
    {
      id: "w-1",
      name: "Leg Day",
      started_at: "2026-09-25T18:00:00Z",
      ended_at: "2026-09-25T19:00:00Z",
    },
  ],
  workoutExercises: [
    {
      id: "we-squat",
      workout_id: "w-1",
      exercise_id: "barbell-back-squat",
      position: 0,
    },
    {
      id: "we-curl",
      workout_id: "w-1",
      exercise_id: "seated-leg-curl",
      position: 1,
    },
  ],
  sets: [
    {
      id: "s-1",
      workout_exercise_id: "we-squat",
      position: 0,
      kind: "working",
      reps: 7,
      weight_kg: 100,
      rpe: 8,
      rir: 2,
      completed_at: "2026-09-25T18:05:00Z",
    },
    {
      id: "s-2",
      workout_exercise_id: "we-squat",
      position: 1,
      kind: "working",
      reps: 7,
      weight_kg: 100,
      rpe: 9,
      rir: 1,
      completed_at: "2026-09-25T18:08:00Z",
    },
    {
      id: "s-3",
      workout_exercise_id: "we-curl",
      position: 0,
      kind: "working",
      reps: 10,
      weight_kg: 50,
      rpe: 8,
      rir: 2,
      completed_at: "2026-09-25T18:30:00Z",
    },
  ],
};

describe("muscle heatmap analytics", () => {
  it("normalizes the highest mapped workload to 1", () => {
    const values = normalizeMuscleWorkloads([
      { muscleId: "quads", mappedSets: 8, mappedVolumeKg: 1000 },
      { muscleId: "hamstrings", mappedSets: 4, mappedVolumeKg: 500 },
    ]);
    expect(values.quads).toBe(1);
    expect(values.hamstrings).toBe(0.5);
  });

  it("returns an empty intensity map when there is no workload", () => {
    expect(normalizeMuscleWorkloads([])).toEqual({});
  });

  it("shows which exercises contributed to a selected muscle", () => {
    const hamstrings = muscleExerciseContributions(dataset, "hamstrings");
    expect(hamstrings.map((row) => row.name)).toContain("Barbell back squat");
    expect(hamstrings.map((row) => row.name)).toContain("Seated leg curl");
    expect(hamstrings[0].mappedSets).toBeGreaterThan(0);
  });

  it("does not invent contributions for an untouched muscle", () => {
    expect(muscleExerciseContributions(dataset, "chest")).toEqual([]);
  });
});
