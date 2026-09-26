import { describe, expect, it } from "vitest";
import {
  newSet,
  validateWorkout,
  tracking,
  weightLabel,
  displayWeight,
  kgPerLb,
  type WorkoutEntry,
} from "../src/lib/workout";
import catalog from "../src/data/exercises.json";
import {
  summarizeDataset,
  exerciseE1rmTrend,
  personalBests,
  muscleWorkloads,
  type AnalyticsDataset,
} from "../src/lib/analytics";

describe("workout conventions and validation", () => {
  it("defines tracking for all 300 catalog entries", () => {
    expect(catalog).toHaveLength(300);
    expect(Object.keys(tracking).sort()).toEqual(
      catalog.map((e) => e.id).sort(),
    );
    for (const e of catalog.filter((e) => e.equipment === "dumbbell"))
      expect(weightLabel(e.id)).toBe("Weight per dumbbell");
    expect(displayWeight(50 * kgPerLb, "imperial")).toBe("50");
  });
  it("copies measurements but clears completion and effort", () => {
    const old = {
      ...newSet(),
      reps: 8,
      weight_kg: 20,
      rpe: 9,
      rir: 1,
      completed_at: new Date().toISOString(),
    };
    const copy = newSet(old);
    expect(copy.id).not.toBe(old.id);
    expect(copy).toMatchObject({
      reps: 8,
      weight_kg: 20,
      rpe: null,
      rir: null,
      completed_at: null,
    });
  });
  it("requires the appropriate completed measurement without rejecting empty drafts", () => {
    const w: WorkoutEntry = {
      id: "w",
      name: "Test",
      started_at: "now",
      ended_at: null,
      revision: 0,
      exercises: [{ id: "e", exercise_id: "plank", sets: [newSet()] }],
    };
    expect(validateWorkout(w)).toBeNull();
    expect(validateWorkout(w, true)).toMatch(/Complete/);
    w.exercises[0].sets[0].completed_at = "now";
    w.exercises[0].sets[0].reps = 10;
    expect(validateWorkout(w)).toMatch(/seconds/);
    w.exercises[0].sets[0].duration_seconds = 30;
    expect(validateWorkout(w, true)).toBeNull();
    w.exercises[0].sets[0].rir = 11;
    expect(validateWorkout(w)).toMatch(/RIR/);
  });
});
describe("analytics boundaries", () => {
  function data(id = "barbell-back-squat"): AnalyticsDataset {
    return {
      workouts: [
        {
          id: "w",
          name: "Test",
          started_at: "2026-09-26",
          ended_at: "2026-09-26",
        },
      ],
      workoutExercises: [
        { id: "e", workout_id: "w", exercise_id: id, position: 0 },
      ],
      sets: [
        {
          ...newSet(),
          workout_exercise_id: "e",
          position: 0,
          reps: 5,
          weight_kg: 100,
          completed_at: "2026-09-26",
        },
      ],
    };
  }
  it("excludes active workouts and orphaned sets across consumers", () => {
    const d = data();
    d.workouts[0].ended_at = null;
    d.sets.push({ ...d.sets[0], id: "orphan", workout_exercise_id: "missing" });
    expect(summarizeDataset(d).completedSets).toBe(0);
    expect(muscleWorkloads(d)).toEqual([]);
    expect(personalBests(d)).toEqual([]);
  });
  it("excludes assistance from volume and load rankings", () => {
    const id = Object.keys(tracking).find(
      (id) => tracking[id].load === "assistance",
    )!;
    const d = data(id);
    expect(summarizeDataset(d).totalVolumeKg).toBe(0);
    expect(personalBests(d).every((b) => b.metric === "reps")).toBe(true);
    expect(exerciseE1rmTrend(d, id)).toEqual([]);
  });
  it("counts timed work without inventing rep volume", () => {
    const d = data("plank");
    d.sets[0].reps = null;
    d.sets[0].duration_seconds = 45;
    expect(summarizeDataset(d)).toMatchObject({
      completedSets: 1,
      totalVolumeKg: 0,
    });
    expect(exerciseE1rmTrend(d, "plank")).toEqual([]);
  });
  it("emits one highest estimate per session even when a lift is repeated", () => {
    const d = data();
    d.workoutExercises.push({
      ...d.workoutExercises[0],
      id: "e2",
      position: 1,
    });
    d.sets.push({
      ...d.sets[0],
      id: "s2",
      workout_exercise_id: "e2",
      weight_kg: 110,
    });
    expect(exerciseE1rmTrend(d, "barbell-back-squat")).toHaveLength(1);
    expect(exerciseE1rmTrend(d, "barbell-back-squat")[0].valueKg).toBeCloseTo(
      110 * (1 + 5 / 30),
    );
  });
});
