import { readFileSync, writeFileSync } from "node:fs";
const exercises = JSON.parse(
  readFileSync(new URL("../src/data/exercises.json", import.meta.url), "utf8"),
);
const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
const sql = [
  "-- Generated from src/data/exercises.json. Regenerate with node scripts/generate-catalog.mjs.",
  "begin;",
];
for (const exercise of exercises) {
  sql.push(
    `insert into public.exercises(id,name,equipment) values(${quote(exercise.id)},${quote(exercise.name)},${quote(exercise.equipment)});`,
  );
  for (const [muscle, involvement] of Object.entries(exercise.muscles)) {
    sql.push(
      `insert into public.exercise_muscles(exercise_id,muscle_id,involvement) values(${quote(exercise.id)},${quote(muscle)},${involvement});`,
    );
  }
}
sql.push("commit;", "");
writeFileSync(
  new URL("../supabase/migrations/202609260002_catalog.sql", import.meta.url),
  sql.join("\n"),
);
