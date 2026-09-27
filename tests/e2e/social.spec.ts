import { test, expect } from "@playwright/test";
test.use({ baseURL: "http://127.0.0.1:4174" });
test("nutrition entry, bodyweight, explicit sharing consent, and benchmark controls", async ({
  page,
}) => {
  const uid = "10000000-0000-4000-8000-000000000001";
  let settings = {
    alias: null as string | null,
    opted_in: false,
    share_benchmark_scores: false,
  };
  let measurement: Record<string, unknown> | null = null;
  const meals: Record<string, unknown>[] = [];
  const items: Record<string, unknown>[] = [];
  const targets: Record<string, unknown>[] = [];
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(
    ({ uid }) =>
      localStorage.setItem(
        "sb-arminius-test-auth-token",
        JSON.stringify({
          access_token: "test-token",
          refresh_token: "test-refresh",
          token_type: "bearer",
          expires_in: 36000,
          expires_at: Math.floor(Date.now() / 1000) + 36000,
          user: {
            id: uid,
            aud: "authenticated",
            role: "authenticated",
            email: "test@example.invalid",
            app_metadata: {},
            user_metadata: {},
            created_at: new Date().toISOString(),
          },
        }),
      ),
    { uid },
  );
  await page.route("https://arminius-test.invalid/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().postDataJSON();
    let result: unknown = [];
    if (path.endsWith("/leaderboard_settings")) {
      if (body) settings = { ...settings, ...body };
      result = settings;
    } else if (path.endsWith("/body_metrics")) {
      if (body) measurement = body;
      result = measurement ? [measurement] : [];
    } else if (path.endsWith("/rpc/save_meal_entry")) {
      meals.push({ id: body.p_id, eaten_at: body.p_eaten_at });
      items.push({ id: "item", meal_id: body.p_id, ...body.p_nutrients });
      result = null;
    } else if (path.endsWith("/rpc/save_daily_nutrition_target")) {
      targets.push({
        metric: body.p_metric,
        target_value: body.p_value,
        period: "daily",
        direction: body.p_direction,
      });
      result = null;
    } else if (path.endsWith("/meals")) result = meals;
    else if (path.endsWith("/meal_items")) result = items;
    else if (path.endsWith("/targets")) result = targets;
    else if (path.endsWith("/benchmark_lifts"))
      result = [
        {
          exercise_id: "barbell-bench-press",
          display_name: "Bench Press",
          category: "chest",
          sort_order: 10,
          machine_variability_note: false,
        },
        {
          exercise_id: "lat-pulldown",
          display_name: "Lat Pulldown",
          category: "back",
          sort_order: 90,
          machine_variability_note: true,
        },
      ];
    else if (path.endsWith("/rpc/get_benchmark_leaderboard")) {
      if (body.p_metric === "relative")
        await new Promise((r) => setTimeout(r, 100));
      result = [
        {
          alias: "Athlete",
          rank_position: 1,
          metric: body.p_metric,
          score:
            body.p_metric === "relative"
              ? 1.5
              : body.p_metric === "growth"
                ? 10
                : 120,
          cohort_size: 6,
        },
      ];
    } else if (path.endsWith("/rpc/get_weekly_trending_exercises"))
      result = [
        {
          rank_position: 1,
          exercise_id: "barbell-bench-press",
          exercise_name: "Bench Press",
          unique_athletes: 3,
          workout_appearances: 4,
        },
      ];
    await route.fulfill({ json: result });
  });
  await page.goto("/nutrition");
  await page.getByText("Add food", { exact: true }).click();
  await page.getByLabel("Food name", { exact: true }).fill("My lunch");
  for (const [label, value] of [
    ["calories", "400"],
    ["protein g", "30"],
    ["carbs g", "40"],
    ["fat g", "10"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole("button", { name: "Save food entry" }).click();
  await expect(page.getByText("Meal saved.")).toBeVisible();
  await expect(page.getByText("400 kcal", { exact: true })).toBeVisible();
  await page.getByText("Set a daily nutrition target", { exact: true }).click();
  await page.getByLabel("Target value", { exact: true }).fill("25");
  await page.getByRole("button", { name: "Save daily target" }).click();
  await expect(page.getByText("Daily target saved.")).toBeVisible();
  await expect(page.getByText("1 of 1 eligible days")).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/nutrition-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Profile", exact: true })
    .click();
  await page.getByLabel("Bodyweight", { exact: true }).fill("80");
  await page.getByRole("button", { name: "Save bodyweight" }).click();
  await expect(page.getByText(/Bodyweight saved/)).toBeVisible();
  await page.getByLabel("Public comparison alias").fill("MyAlias");
  await page
    .getByLabel("Participate in aggregate comparisons and community trends")
    .check();
  const named = page.getByLabel(/Show my alias, absolute score/);
  await expect(named).not.toBeChecked();
  await named.check();
  await page.getByRole("button", { name: "Save comparison settings" }).click();
  await expect(page.getByText("Comparison settings saved.")).toBeVisible();
  expect(settings.share_benchmark_scores).toBe(true);
  await page.goto("/leaderboards");
  await expect(page.getByText("1.50× BW")).toBeVisible();
  await page.getByRole("button", { name: "Platform", exact: true }).click();
  await page.getByLabel("Show", { exact: true }).selectOption("500");
  await page.getByRole("button", { name: "Absolute", exact: true }).click();
  await expect(page.getByText("120.0 kg e1RM")).toBeVisible();
  await page.getByRole("button", { name: "Lat Pulldown", exact: true }).click();
  await expect(page.getByText(/Machine resistance can vary/)).toBeVisible();
  await page.getByRole("button", { name: "90d Growth", exact: true }).click();
  await expect(page.getByText("+10.0%", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/social-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Trending this week" }),
  ).toBeVisible();
  await expect(page.getByText("3 athletes · 4 workouts")).toBeVisible();
  expect(await page.getByRole("navigation").getByRole("link").count()).toBe(5);
  expect(errors).toEqual([]);
});
