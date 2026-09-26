import catalog from "../../data/exercises.json";
export const muscleIds = [
  "chest",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "core",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "lats",
  "upper_back",
  "lower_back",
] as const;
export type MuscleId = (typeof muscleIds)[number];
export type MuscleLoads = Partial<Record<MuscleId, number>>;
export type Exercise = {
  id: string;
  name: string;
  equipment: string;
  muscles: MuscleLoads;
};
export const exercises: Exercise[] = catalog;
// Fixed illustrative involvement weights, not measured activation or recovery.
// Sorting and max aggregation make the output stable and independent of selection order.
export function muscleLoads(exerciseIds: readonly string[]): MuscleLoads {
  const loads: MuscleLoads = {};
  for (const id of [...new Set(exerciseIds)].sort()) {
    const exercise = exercises.find((e) => e.id === id);
    if (!exercise) continue;
    for (const muscle of muscleIds) {
      const weight = exercise.muscles[muscle];
      if (weight !== undefined)
        loads[muscle] = Math.max(loads[muscle] ?? 0, weight);
    }
  }
  return loads;
}
