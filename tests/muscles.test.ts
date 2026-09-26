import { describe, expect, it } from "vitest";
import {
  exercises,
  muscleIds,
  muscleLoads,
} from "../src/components/muscle-map/model";
import { regions } from "../src/components/muscle-map/regions";
describe("exercise-to-muscle contract", () => {
  it("is deterministic, duplicate-safe, and ignores unknown exercises", () => {
    expect(muscleLoads(["squat", "row", "squat"])).toEqual(
      muscleLoads(["row", "squat"]),
    );
    expect(muscleLoads(["unknown"])).toEqual({});
    expect(muscleLoads(["push-up"])).toEqual({
      chest: 1,
      shoulders: 0.5,
      triceps: 0.5,
      core: 0.25,
    });
  });
  it("renders every catalog muscle in at least one view with a bounded involvement", () => {
    const rendered = new Set(
      Object.values(regions)
        .flat()
        .map((r) => r.muscle),
    );
    expect(new Set(exercises.map((e) => e.id)).size).toBe(exercises.length);
    for (const e of exercises)
      for (const [muscle, weight] of Object.entries(e.muscles)) {
        expect(muscleIds).toContain(muscle);
        expect(rendered.has(muscle as (typeof muscleIds)[number])).toBe(true);
        expect(weight).toBeGreaterThan(0);
        expect(weight).toBeLessThanOrEqual(1);
      }
  });
});
