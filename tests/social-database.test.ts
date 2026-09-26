import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, it, expect } from "vitest";
const db = new PGlite();
const users = Array.from({ length: 7 }, () => crypto.randomUUID());
const ownedSets: string[] = [];
const workoutIds: string[] = [];
async function asUser(i: number) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    users[i],
  ]);
  await db.exec("set role authenticated");
}
async function rpc(name: string, args: unknown[] = []) {
  return db.query<Record<string, unknown>>(
    `select * from ${name}(${args.map((_, i) => "$" + (i + 1)).join(",")})`,
    args,
  );
}
async function session(
  i: number,
  exercise = "barbell-bench-press",
  weight = 100,
  days = 2,
) {
  const w = crypto.randomUUID(),
    l = crypto.randomUUID(),
    s = crypto.randomUUID();
  await db.query(
    "insert into workouts(id,user_id,started_at,ended_at) values($1,$2,now()-$3*interval '1 day',now()-$3*interval '1 day'+interval '1 hour')",
    [w, users[i], days],
  );
  await db.query(
    "insert into workout_exercises(id,user_id,workout_id,exercise_id,position) values($1,$2,$3,$4,0)",
    [l, users[i], w, exercise],
  );
  await db.query(
    "insert into sets(id,user_id,workout_exercise_id,position,reps,weight_kg,completed_at) values($1,$2,$3,0,5,$4,now()-$5*interval '1 day'+interval '10 minutes')",
    [s, users[i], l, weight, days],
  );
  return { w, l, s };
}
beforeAll(async () => {
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;`,
  );
  const dir = new URL("../supabase/migrations/", import.meta.url);
  for (const f of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(new URL(f, dir), "utf8"));
  for (let i = 0; i < users.length; i++) {
    await db.query("insert into auth.users values($1)", [users[i]]);
    await db.query(
      "update leaderboard_settings set alias=$2,opted_in=$3,share_benchmark_scores=$3 where user_id=$1",
      [users[i], "Athlete" + i, i > 0 && i < 6],
    );
    await db.query(
      "insert into body_metrics(user_id,weight_kg,measured_at) values($1,80,now()-interval '30 days')",
      [users[i]],
    );
    const row = await session(i, "barbell-bench-press", 100 + i * 10);
    ownedSets.push(row.s);
    workoutIds.push(row.w);
  }
  await session(1, "barbell-bench-press", 100, 20);
  // Same timestamp: deterministic workout-ID ordering must still produce one score row.
  await session(2, "barbell-bench-press", 120, 2);
  await db.query(
    "update workouts set started_at=now()-interval '2 days',ended_at=now()-interval '2 days'+interval '1 hour' where user_id=$1",
    [users[2]],
  );
}, 60000);
afterAll(() => db.close());
it("suppresses stale bodyweight and assistance scores", async () => {
  await asUser(4);
  await session(4, "weighted-pull-up", 20, 2);
  await db.exec(
    "update body_metrics set measured_at=now()-interval '100 days' where user_id=auth.uid()",
  );
  await session(4, "assisted-pull-up", 100, 2);
  await rpc("refresh_my_strength_scores");
  expect(
    (
      await db.query(
        "select exercise_id from strength_scores where exercise_id in ('weighted-pull-up','assisted-pull-up')",
      )
    ).rows,
  ).toEqual([]);
  await db.exec(
    "update body_metrics set measured_at=now()-interval '30 days' where user_id=auth.uid()",
  );
  await db.query("delete from workouts where user_id=auth.uid() and id<>$1", [
    workoutIds[4],
  ]);
});
it("derives peer scores without waiting for those peers to visit Progress; excludes opt-outs", async () => {
  await asUser(0);
  const board = await rpc("get_benchmark_leaderboard", [
    "barbell-bench-press",
    "platform",
    "absolute",
    500,
  ]);
  expect(board.rows).toHaveLength(5);
  expect(board.rows.map((r) => r.alias)).not.toContain("Athlete6");
  expect(Object.keys(board.rows[0]).sort()).toEqual([
    "alias",
    "cohort_size",
    "metric",
    "rank_position",
    "score",
  ]);
  const p = (await rpc("get_my_strength_percentiles", ["barbell-bench-press"]))
    .rows[0];
  expect(Number(p.platform_absolute_n)).toBe(5);
  expect(Number(p.platform_absolute_percentile)).toBe(0);
});
it("gives equal scores equal ranks and uses explicit named-score consent", async () => {
  await asUser(1);
  await db.query("update sets set weight_kg=120 where id=$1", [ownedSets[1]]);
  await asUser(0);
  let board = (
    await rpc("get_benchmark_leaderboard", [
      "barbell-bench-press",
      "platform",
      "absolute",
      25,
    ])
  ).rows;
  expect(board.find((r) => r.alias === "Athlete1")?.rank_position).toBe(
    board.find((r) => r.alias === "Athlete2")?.rank_position,
  );
  await asUser(1);
  await db.exec(
    "update leaderboard_settings set share_benchmark_scores=false where user_id=auth.uid()",
  );
  await asUser(0);
  board = (
    await rpc("get_benchmark_leaderboard", [
      "barbell-bench-press",
      "platform",
      "absolute",
      25,
    ])
  ).rows;
  expect(board.map((r) => r.alias)).not.toContain("Athlete1");
  const p = (await rpc("get_my_strength_percentiles", ["barbell-bench-press"]))
    .rows[0];
  expect(Number(p.platform_absolute_n)).toBe(5);
  await asUser(1);
  await db.exec(
    "update leaderboard_settings set share_benchmark_scores=true where user_id=auth.uid()",
  );
});
it("computes first-to-latest session growth and expires cached windows", async () => {
  await asUser(0);
  const rows = (
    await rpc("get_benchmark_leaderboard", [
      "barbell-bench-press",
      "platform",
      "growth",
      100,
    ])
  ).rows;
  expect(Number(rows.find((r) => r.alias === "Athlete1")?.score)).toBeCloseTo(
    20,
  );
  expect(rows.filter((r) => r.alias === "Athlete2")).toHaveLength(1);
  await db.exec("reset role");
  await db.query(
    "update workouts set started_at=now()-interval '100 days',ended_at=now()-interval '99 days' where user_id=$1 and started_at<now()-interval '10 days'",
    [users[1]],
  );
  await asUser(0);
  const after = (
    await rpc("get_benchmark_leaderboard", [
      "barbell-bench-press",
      "platform",
      "growth",
      100,
    ])
  ).rows;
  expect(after.map((r) => r.alias)).not.toContain("Athlete1");
});
it("uses bodyweight plus added load for weighted pull-ups, and invalidates on bodyweight edits", async () => {
  await asUser(3);
  await session(3, "weighted-pull-up", 20, 2);
  await asUser(0);
  let rows = (
    await rpc("get_benchmark_leaderboard", [
      "weighted-pull-up",
      "platform",
      "absolute",
      25,
    ])
  ).rows;
  expect(Number(rows[0].score)).toBeCloseTo(100 * (1 + 5 / 30));
  await asUser(3);
  await db.exec(
    "update body_metrics set weight_kg=90 where user_id=auth.uid()",
  );
  await asUser(0);
  rows = (
    await rpc("get_benchmark_leaderboard", [
      "weighted-pull-up",
      "platform",
      "absolute",
      25,
    ])
  ).rows;
  expect(Number(rows[0].score)).toBeCloseTo(110 * (1 + 5 / 30));
  await asUser(3);
  await db.exec(
    "update body_metrics set measured_at=now()+interval '1 day' where user_id=auth.uid()",
  );
  await asUser(0);
  expect(
    (
      await rpc("get_benchmark_leaderboard", [
        "weighted-pull-up",
        "platform",
        "absolute",
        25,
      ])
    ).rows,
  ).toEqual([]);
});
it("denies score forgery, private helper calls, and raw peer access", async () => {
  await asUser(0);
  for (const table of [
    "strength_scores",
    "benchmark_scores",
    "benchmark_lifts",
    "friendships",
    "strength_cache_state",
  ])
    await expect(db.exec(`delete from ${table}`)).rejects.toThrow(
      /permission denied/,
    );
  for (const table of ["friendships", "strength_cache_state"])
    await expect(db.exec(`select * from ${table}`)).rejects.toThrow(
      /permission denied/,
    );
  for (const table of [
    "workouts",
    "sets",
    "body_metrics",
    "strength_scores",
    "benchmark_scores",
  ])
    expect(
      (await db.query(`select * from ${table} where user_id=$1`, [users[1]]))
        .rows,
    ).toEqual([]);
  await expect(rpc("_refresh_user_strength", [users[1]])).rejects.toThrow(
    /permission denied/,
  );
  await expect(rpc("_session_strengths", [users[1]])).rejects.toThrow(
    /permission denied/,
  );
  await expect(
    rpc("get_benchmark_leaderboard", ["plank", "platform", "absolute", 25]),
  ).rejects.toThrow(/Unsupported/);
});
it("enforces accepted friendships and suppresses one-person percentiles", async () => {
  await asUser(0);
  await db.exec(
    "update leaderboard_settings set alias='Viewer',opted_in=true where user_id=auth.uid()",
  );
  const request = String(
    (await rpc("send_friend_request_by_alias", ["athlete1"])).rows[0]
      .send_friend_request_by_alias,
  );
  expect(
    (
      await rpc("get_benchmark_leaderboard", [
        "barbell-bench-press",
        "friends",
        "absolute",
        25,
      ])
    ).rows,
  ).toEqual([]);
  await asUser(2);
  await expect(
    rpc("respond_friend_request", [request, true]),
  ).rejects.toThrow();
  await asUser(1);
  await rpc("respond_friend_request", [request, true]);
  await asUser(0);
  expect(
    (
      await rpc("get_benchmark_leaderboard", [
        "barbell-bench-press",
        "friends",
        "absolute",
        25,
      ])
    ).rows.map((r) => r.alias),
  ).toEqual(["Athlete1"]);
  const p = (await rpc("get_my_strength_percentiles", ["barbell-bench-press"]))
    .rows[0];
  expect(Number(p.friend_absolute_n)).toBe(1);
  expect(p.friend_absolute_percentile).toBeNull();
  await rpc("remove_friendship", [request]);
  expect(
    (
      await rpc("get_benchmark_leaderboard", [
        "barbell-bench-press",
        "friends",
        "absolute",
        25,
      ])
    ).rows,
  ).toEqual([]);
});
it("trends count completed work and catalog foods; never private custom labels", async () => {
  await db.exec("reset role");
  const food = crypto.randomUUID();
  await db.query(
    "insert into foods(id,name,serving_grams,calories,protein_g,carbs_g,fat_g) values($1,'Catalog oats',100,100,1,1,1)",
    [food],
  );
  for (let i = 1; i <= 3; i++) {
    await asUser(i);
    await session(i, "barbell-back-squat", 100, 0.1);
    const nutrition = { calories: 100, protein_g: 1, carbs_g: 1, fat_g: 1 };
    await rpc("save_meal_entry", [
      crypto.randomUUID(),
      "Private custom note",
      100,
      new Date(Date.now() - 60000).toISOString(),
      null,
      nutrition,
    ]);
    await rpc("save_meal_entry", [
      crypto.randomUUID(),
      "Snapshot display",
      100,
      new Date(Date.now() - 60000).toISOString(),
      food,
      nutrition,
    ]);
  }
  await asUser(0);
  const foods = (await rpc("get_weekly_trending_foods", [10])).rows;
  expect(foods.map((r) => r.food_name)).toEqual(["Catalog oats"]);
  const ex = (await rpc("get_weekly_trending_exercises", [10])).rows;
  expect(ex.some((r) => r.exercise_id === "barbell-back-squat")).toBe(true);
});
it("atomically logs nutrition snapshots with unknown optional values and replaces only own targets", async () => {
  await asUser(0);
  const id = crypto.randomUUID();
  const args = [
    id,
    "Lunch",
    200,
    new Date(Date.now() - 1000).toISOString(),
    null,
    { calories: 400, protein_g: 30, carbs_g: 40, fat_g: 10 },
  ];
  await rpc("save_meal_entry", args);
  await rpc("save_meal_entry", args);
  expect(
    (await db.query("select fiber_g from meal_items where meal_id=$1", [id]))
      .rows,
  ).toEqual([{ fiber_g: null }]);
  const badId = crypto.randomUUID();
  await expect(
    rpc("save_meal_entry", [
      badId,
      "Bad",
      100,
      new Date().toISOString(),
      null,
      { calories: 1 },
    ]),
  ).rejects.toThrow();
  expect(
    (await db.query("select id from meals where id=$1", [badId])).rows,
  ).toEqual([]);
  await rpc("save_daily_nutrition_target", ["protein_g", 100, "minimum"]);
  await rpc("save_daily_nutrition_target", ["protein_g", 120, "minimum"]);
  expect(
    (
      await db.query(
        "select target_value from targets where metric='protein_g' and user_id=auth.uid()",
      )
    ).rows,
  ).toEqual([{ target_value: "120" }]);
  await asUser(6);
  expect(
    (await db.query("select * from meal_items where meal_id=$1", [id])).rows,
  ).toEqual([]);
  await db.exec("reset role;set role anon");
  await expect(
    rpc("get_benchmark_leaderboard", ["barbell-bench-press"]),
  ).rejects.toThrow(/permission denied/);
});
