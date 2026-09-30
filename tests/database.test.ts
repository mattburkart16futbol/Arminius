import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { exercises } from "../src/components/muscle-map/model";
import { tracking, newSet } from "../src/lib/workout";

const db = new PGlite();
const alice = "10000000-0000-4000-8000-000000000001";
const bob = "10000000-0000-4000-8000-000000000002";
const ids = {
  goal: "20000000-0000-4000-8000-000000000001",
  workout: "20000000-0000-4000-8000-000000000002",
  exercise: "20000000-0000-4000-8000-000000000003",
  meal: "20000000-0000-4000-8000-000000000004",
  request: "20000000-0000-4000-8000-000000000005",
};
const ownerTables = [
  "goals",
  "targets",
  "workouts",
  "workout_exercises",
  "sets",
  "meals",
  "meal_items",
  "body_metrics",
  "leaderboard_settings",
];
const serverTables = [
  "user_achievements",
  "personal_records",
  "ai_requests",
  "recommendations",
];
async function asUser(user: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
    user,
  ]);
  await db.exec("set role authenticated");
}
beforeAll(async () => {
  // PostgreSQL engine with the minimal Supabase Auth contract; hosted Auth itself is not mocked as tested.
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;
    insert into auth.users values('${alice}');`);
  const directory = new URL("../supabase/migrations/", import.meta.url);
  for (const file of readdirSync(directory)
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(new URL(file, directory), "utf8"));
  await db.exec(`insert into auth.users values('${bob}');
    insert into public.goals(id,user_id,title,category) values('${ids.goal}','${alice}','Strength','training');
    insert into public.targets(user_id,goal_id,metric,target_value,period) values('${alice}','${ids.goal}','sessions',4,'weekly');
    insert into public.workouts(id,user_id) values('${ids.workout}','${alice}');
    insert into public.workout_exercises(id,user_id,workout_id,exercise_id,position) values('${ids.exercise}','${alice}','${ids.workout}','squat',0);
    insert into public.sets(user_id,workout_exercise_id,position,reps) values('${alice}','${ids.exercise}',0,10);
    insert into public.meals(id,user_id,name) values('${ids.meal}','${alice}','Lunch');
    insert into public.meal_items(user_id,meal_id,name,quantity,quantity_unit,quantity_grams,calories,protein_g,carbs_g,fat_g) values('${alice}','${ids.meal}','Sample',100,'g',100,100,10,10,2);
    insert into public.body_metrics(user_id,weight_kg) values('${alice}',80);
    insert into public.achievements values('first','First session','Complete a workout','{}');
    insert into public.user_achievements(user_id,achievement_id) values('${alice}','first');
    insert into public.personal_records(user_id,exercise_id,metric,value) values('${alice}','squat','reps',10);
    insert into public.ai_requests(id,user_id,kind) values('${ids.request}','${alice}','training');
    insert into public.recommendations(user_id,ai_request_id,content,model_version) values('${alice}','${ids.request}','{}','test');`);
}, 60000);
afterAll(async () => {
  await db.close();
});

describe("migrations and ownership boundaries", () => {
  it("creates profiles for existing and new Auth users, private by default", async () => {
    for (const user of [alice, bob]) {
      await asUser(user);
      expect((await db.query("select id from profiles")).rows).toEqual([
        { id: user },
      ]);
      expect(
        (await db.query("select opted_in from leaderboard_settings")).rows,
      ).toEqual([{ opted_in: false }]);
    }
  });
  it("enables RLS on every application table", async () => {
    await db.exec("reset role");
    const tables = await db.query<{ relrowsecurity: boolean; relname: string }>(
      "select relname,relrowsecurity from pg_class join pg_namespace on pg_namespace.oid=relnamespace where nspname='public' and relkind='r'",
    );
    expect(tables.rows.map((t) => t.relname)).toEqual(
      expect.arrayContaining([
        "profiles",
        "workouts",
        "sets",
        "friendships",
        "strength_scores",
        "benchmark_lifts",
        "benchmark_scores",
        "strength_cache_state",
      ]),
    );
    expect(tables.rows.every((t) => t.relrowsecurity)).toBe(true);
  });
  it("keeps the SQL catalog equal to the SVG data contract", async () => {
    await asUser(alice);
    for (const exercise of exercises) {
      const result = await db.query<{ muscle_id: string; involvement: string }>(
        "select muscle_id,involvement from exercise_muscles where exercise_id=$1",
        [exercise.id],
      );
      expect(
        Object.fromEntries(
          result.rows.map((r) => [r.muscle_id, Number(r.involvement)]),
        ),
      ).toEqual(exercise.muscles);
    }
  });
  it("lets owners read their rows while hiding them from other users", async () => {
    for (const table of [
      ...ownerTables.filter((t) => t !== "leaderboard_settings"),
      ...serverTables,
    ]) {
      await asUser(alice);
      expect(
        (await db.query(`select * from ${table}`)).rows.length,
      ).toBeGreaterThan(0);
      await asUser(bob);
      expect((await db.query(`select * from ${table}`)).rows).toEqual([]);
      if (ownerTables.includes(table)) {
        expect(
          (
            await db.query(
              `update ${table} set user_id='${bob}' where user_id='${alice}' returning *`,
            )
          ).rows,
        ).toEqual([]);
        expect(
          (
            await db.query(
              `delete from ${table} where user_id='${alice}' returning *`,
            )
          ).rows,
        ).toEqual([]);
      }
    }
  });
  it("allows owner CRUD and rejects changing ownership", async () => {
    await asUser(bob);
    const result = await db.query<{ id: string }>(
      "insert into workouts(name) values('My session') returning id",
    );
    const id = result.rows[0].id;
    expect(
      (
        await db.query(
          "update workouts set name=$1 where id=$2 returning name",
          ["Updated", id],
        )
      ).rows,
    ).toEqual([{ name: "Updated" }]);
    await expect(
      db.query("update workouts set user_id=$1 where id=$2", [alice, id]),
    ).rejects.toThrow();
    await expect(
      db.query("insert into workouts(user_id) values($1)", [alice]),
    ).rejects.toThrow();
    expect(
      (await db.query("delete from workouts where id=$1 returning id", [id]))
        .rows,
    ).toHaveLength(1);
    await db.exec("update profiles set display_name='Bob' where id=auth.uid()");
    await expect(
      db.exec(`update profiles set id='${alice}'`),
    ).rejects.toThrow();
  });
  it("rejects child references into another user account", async () => {
    await asUser(bob);
    for (const sql of [
      `insert into targets(goal_id,metric,target_value,period) values('${ids.goal}','sessions',3,'weekly')`,
      `insert into workout_exercises(workout_id,exercise_id,position) values('${ids.workout}','squat',1)`,
      `insert into sets(workout_exercise_id,position,reps) values('${ids.exercise}',1,5)`,
      `insert into meal_items(meal_id,name,quantity,quantity_unit,quantity_grams,calories,protein_g,carbs_g,fat_g) values('${ids.meal}','Invalid',1,'g',1,1,1,1,1)`,
    ])
      await expect(db.exec(sql)).rejects.toThrow();
  });
  it("prevents clients from writing trusted results or catalogs", async () => {
    await asUser(alice);
    for (const table of [
      ...serverTables,
      "exercises",
      "exercise_muscles",
      "foods",
      "achievements",
    ]) {
      await expect(db.exec(`delete from ${table}`)).rejects.toThrow(
        /permission denied/,
      );
    }
    await expect(
      db.exec(
        `insert into ai_requests(user_id,kind) values('${alice}','training')`,
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.exec(
        `insert into user_achievements(user_id,achievement_id) values('${alice}','first')`,
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("denies anonymous reads and writes", async () => {
    await db.exec("reset role; set role anon");
    for (const table of [
      "profiles",
      ...ownerTables,
      ...serverTables,
      "exercises",
      "exercise_muscles",
      "foods",
      "achievements",
    ]) {
      await expect(db.exec(`select * from ${table}`)).rejects.toThrow(
        /permission denied/,
      );
      await expect(db.exec(`delete from ${table}`)).rejects.toThrow(
        /permission denied/,
      );
    }
  });
  it("rejects invalid data and cascades owned parent deletion", async () => {
    await asUser(alice);
    await expect(
      db.exec("insert into body_metrics(weight_kg) values(-1)"),
    ).rejects.toThrow();
    await expect(
      db.exec("update leaderboard_settings set opted_in=true"),
    ).rejects.toThrow();
    await db.exec(`delete from workouts where id='${ids.workout}'`);
    expect((await db.query("select * from workout_exercises")).rows).toEqual(
      [],
    );
    expect((await db.query("select * from sets")).rows).toEqual([]);
  });
  it("matches all exercise tracking metadata to SQL", async () => {
    await asUser(alice);
    const rows = await db.query<{
      id: string;
      tracking_mode: string;
      load_mode: string;
      training_category: string;
      e1rm_eligible: boolean;
    }>(
      "select id,tracking_mode,load_mode,training_category,e1rm_eligible from exercises",
    );
    expect(rows.rows).toHaveLength(301);
    for (const row of rows.rows)
      expect(tracking[row.id]).toEqual({
        mode: row.tracking_mode,
        load: row.load_mode,
        category: row.training_category,
        e1rm: row.e1rm_eligible,
      });
  });
  it("saves snapshots atomically, rejects stale edits, and retries without duplication", async () => {
    await asUser(alice);
    const id = crypto.randomUUID(),
      request = crypto.randomUUID(),
      lift = crypto.randomUUID();
    const entry = {
      ...newSet(),
      reps: 8,
      weight_kg: 25,
      completed_at: new Date().toISOString(),
    };
    const lifts = [
      { id: lift, exercise_id: "dumbbell-bench-press", sets: [entry] },
    ];
    const save = (
      revision: number,
      rows: unknown,
      finish = false,
      key = crypto.randomUUID(),
    ) =>
      db.query<{ result: { revision: number; ended_at: string | null } }>(
        "select save_workout($1,$2,$3,$4::jsonb,$5,$6) result",
        [id, revision, "Test", JSON.stringify(rows), finish, key],
      );
    expect((await save(0, lifts, false, request)).rows[0].result.revision).toBe(
      1,
    );
    expect((await save(0, lifts, false, request)).rows[0].result.revision).toBe(
      1,
    );
    await expect(save(0, lifts)).rejects.toThrow(/changed/);
    await expect(
      save(1, [{ ...lifts[0], sets: [{ ...entry, rir: 11 }] }]),
    ).rejects.toThrow();
    expect(
      (
        await db.query("select reps,weight_kg from sets where id=$1", [
          entry.id,
        ])
      ).rows,
    ).toEqual([{ reps: 8, weight_kg: "25" }]);
    expect(
      (await db.query("select revision from workouts where id=$1", [id])).rows,
    ).toEqual([{ revision: 1 }]);
    await expect(
      db.exec("insert into workouts(name) values('Duplicate')"),
    ).rejects.toThrow();
    await asUser(bob);
    await expect(save(0, lifts)).rejects.toThrow();
    expect(
      (await db.query("select id from sets where id=$1", [entry.id])).rows,
    ).toEqual([]);
    await asUser(alice);
    const result = await save(
      1,
      [{ ...lifts[0], sets: [{ ...entry, reps: 12 }] }],
      true,
    );
    expect(result.rows[0].result.ended_at).not.toBeNull();
    expect(
      (await db.query("select reps from sets where id=$1", [entry.id])).rows,
    ).toEqual([{ reps: 12 }]);
    await expect(save(2, lifts)).rejects.toThrow(/changed/);
  });
  it("supports empty drafts and validates timed completion at the database boundary", async () => {
    await asUser(bob);
    const id = crypto.randomUUID();
    const entry = newSet();
    const lift = {
      id: crypto.randomUUID(),
      exercise_id: "plank",
      sets: [entry],
    };
    const save = (rev: number, finish = false) =>
      db.query("select save_workout($1,$2,$3,$4::jsonb,$5,$6)", [
        id,
        rev,
        "Timed",
        JSON.stringify([lift]),
        finish,
        crypto.randomUUID(),
      ]);
    await save(0);
    await expect(save(1, true)).rejects.toThrow(/Complete at least/);
    entry.completed_at = new Date().toISOString();
    entry.reps = 10;
    await expect(save(1, true)).rejects.toThrow(/tracking measurement/);
    entry.reps = null;
    entry.duration_seconds = 45;
    await save(1, true);
    await db.exec("reset role;set role anon");
    await expect(save(0)).rejects.toThrow(/permission denied/);
  });
});
