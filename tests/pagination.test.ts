import { expect, it, vi } from "vitest";
const { ranges, groups } = vi.hoisted(() => ({
  ranges: [] as number[],
  groups: [] as number[],
}));
vi.mock("../src/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: (_column: string, ids: string[]) => {
          groups.push(ids.length);
          return {
            order: () => ({
              range: async (from: number, to: number) => {
                ranges.push(from);
                return {
                  error: null,
                  data: Array.from(
                    { length: Math.max(0, Math.min(to + 1, 1201) - from) },
                    (_, i) => ({ id: from + i }),
                  ),
                };
              },
            }),
          };
        },
      }),
    }),
  },
}));
import { children } from "../src/lib/workout-api";
it("loads records beyond the API page limit and bounds parent filters", async () => {
  const rows = await children(
    "sets",
    "workout_exercise_id",
    Array.from({ length: 51 }, (_, i) => String(i)),
    "id",
  );
  expect(rows).toHaveLength(2402);
  expect(ranges).toEqual([0, 500, 1000, 0, 500, 1000]);
  expect(Math.max(...groups)).toBe(50);
});
