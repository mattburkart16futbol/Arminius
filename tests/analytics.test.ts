import { describe, expect, it } from "vitest";
import {
  estimatedOneRepMaxKg,
  exerciseE1rmTrend,
  exerciseSummaries,
  muscleWorkloads,
  personalBests,
  setVolumeKg,
  summarizeDataset,
  type AnalyticsDataset,
  type AnalyticsSet,
} from "../src/lib/analytics";

function set(overrides: Partial<AnalyticsSet> = {}): AnalyticsSet {
  return {
    id: "set-1",
    workout_exercise_id: "we-1",
    position: 0,
    kind: "working",
    reps: 10,
    weight_kg: 100,
    rpe: 8,
    rir: 2,
    completed_at: "2026-09-25T18:00:00Z",
    ...overrides,
  };
}

const dataset: AnalyticsDataset = {
  workouts: [
    {
      id: "w-1",
      name: "Leg Day",
      started_at: "2026-09-20T18:00:00Z",
      ended_at: "2026-09-20T19:00:00Z",
    },
    {
      id: "w-2",
      name: "Leg Day",
      started_at: "2026-09-25T18:00:00Z",
      ended_at: "2026-09-25T19:00:00Z",
    },
  ],
  workoutExercises: [
    {
      id: "we-1",
      workout_id: "w-1",
      exercise_id: "barbell-back-squat",
      position: 0,
    },
    {
      id: "we-2",
      workout_id: "w-2",
      exercise_id: "barbell-back-squat",
      position: 0,
    },
  ],
  sets: [
    set({ id: "s-1", workout_exercise_id: "we-1", reps: 8, weight_kg: 90 }),
    set({
      id: "s-2",
      workout_exercise_id: "we-1",
      position: 1,
      kind: "warmup",
      reps: 5,
      weight_kg: 50,
    }),
    set({
      id: "s-3",
      workout_exercise_id: "we-2",
      reps: 7,
      weight_kg: 100,
      completed_at: "2026-09-25T18:05:00Z",
    }),
  ],
};

describe("training analytics", () => {
  it("calculates external-load volume only for completed non-warm-up sets", () => {
    expect(setVolumeKg(set())).toBe(1000);
    expect(setVolumeKg(set({ kind: "warmup" }))).toBe(0);
    expect(setVolumeKg(set({ completed_at: null }))).toBe(0);
    expect(setVolumeKg(set({ weight_kg: null }))).toBe(0);
  });

  it("uses Epley for 1-12 reps and rejects high-rep/no-load estimates", () => {
    expect(estimatedOneRepMaxKg(set({ reps: 10, weight_kg: 100 }))).toBeCloseTo(
      133.333,
      2,
    );
    expect(estimatedOneRepMaxKg(set({ reps: 13 }))).toBeNull();
    expect(estimatedOneRepMaxKg(set({ weight_kg: 0 }))).toBeNull();
  });

  it("summarizes only completed training work", () => {
    expect(summarizeDataset(dataset)).toEqual({
      sessions: 2,
      completedSets: 2,
      totalReps: 15,
      totalVolumeKg: 1420,
    });
  });

  it("builds chronological e1RM trends", () => {
    const trend = exerciseE1rmTrend(dataset, "barbell-back-squat");
    expect(trend).toHaveLength(2);
    expect(trend[0].startedAt).toBe("2026-09-20T18:00:00Z");
    expect(trend[1].valueKg).toBeGreaterThan(trend[0].valueKg);
  });

  it("summarizes exercises and identifies current bests", () => {
    const summaries = exerciseSummaries(dataset);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].sessions).toBe(2);
    expect(summaries[0].bestWeightKg).toBe(100);

    const bests = personalBests(dataset);
    expect(
      bests.find(
        (best) =>
          best.exerciseId === "barbell-back-squat" && best.metric === "weight",
      )?.value,
    ).toBe(100);
  });

  it("aggregates mapped muscle workload without calling it activation", () => {
    const loads = muscleWorkloads(dataset);
    const quads = loads.find((load) => load.muscleId === "quads");
    const glutes = loads.find((load) => load.muscleId === "glutes");
    expect(quads?.mappedSets).toBe(2);
    expect(glutes?.mappedSets).toBe(2);
  });
});
