import { test, expect } from "@playwright/test";
test.use({ baseURL: "http://127.0.0.1:4174" });
test("save failures, draft restoration, finish, reload, and muscle analytics", async ({
  page,
}) => {
  const uid = "10000000-0000-4000-8000-000000000001";
  type Saved = {
    id: string;
    name: string;
    revision: number;
    started_at: string;
    ended_at: string | null;
    exercises: {
      id: string;
      exercise_id: string;
      sets: Record<string, unknown>[];
    }[];
  };
  let workout: Saved | null = null;
  let fail = false;
  await page.addInitScript(
    ({ uid }) => {
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
      );
    },
    { uid },
  );
  await page.route("https://arminius-test.invalid/**", async (route) => {
    const url = new URL(route.request().url());
    let result: unknown = [];
    if (url.pathname.includes("/auth/"))
      result = { id: uid, email: "test@example.invalid" };
    else if (url.pathname.endsWith("/rpc/save_workout")) {
      if (fail) {
        fail = false;
        await route.fulfill({
          status: 503,
          json: { message: "Simulated network failure" },
        });
        return;
      }
      const body = route.request().postDataJSON();
      workout = {
        id: body.p_id,
        name: body.p_name,
        revision: (workout?.revision ?? 0) + 1,
        started_at: workout?.started_at ?? new Date().toISOString(),
        ended_at: body.p_finish ? new Date().toISOString() : null,
        exercises: body.p_exercises,
      };
      result = {
        revision: workout.revision,
        started_at: workout.started_at,
        ended_at: workout.ended_at,
      };
    } else if (url.pathname.endsWith("/profiles"))
      result = { unit_system: "imperial" };
    else if (url.pathname.endsWith("/workouts"))
      result =
        workout &&
        (url.searchParams.get("ended_at") === "is.null") === !workout.ended_at
          ? [workout]
          : [];
    else if (url.pathname.endsWith("/workout_exercises"))
      result =
        workout?.exercises.map((l, position) => ({
          ...l,
          workout_id: workout!.id,
          position,
        })) ?? [];
    else if (url.pathname.endsWith("/sets"))
      result =
        workout?.exercises.flatMap((l) =>
          l.sets.map((s, position) => ({
            ...s,
            workout_exercise_id: l.id,
            position,
          })),
        ) ?? [];
    await route.fulfill({ json: result });
  });
  await page.goto("/workout");
  await page
    .getByRole("button", { name: "Start workout", exact: true })
    .click();
  await expect(page.getByText("All workout edits saved.")).toBeVisible();
  await page.getByLabel("Search exercises").fill("dumbbell bench press");
  await page.getByRole("button", { name: "Add exercise", exact: true }).click();
  await page
    .getByLabel("Set 1 weight per dumbbell", { exact: true })
    .fill("50");
  await page.getByLabel("Reps", { exact: true }).fill("8");
  fail = true;
  await page.getByRole("button", { name: "Complete & save set 1" }).click();
  await expect(page.getByRole("alert")).toContainText("Unable to save");
  await expect(page.getByLabel("Reps", { exact: true })).toHaveValue("8");
  // Reload keeps unsaved values in the same tab without sending them to another service.
  page.on("dialog", (d) => d.accept());
  await page.reload();
  await expect(
    page.getByText(/unsaved edits from this tab were restored/),
  ).toBeVisible();
  await expect(
    page.getByLabel("Set 1 weight per dumbbell", { exact: true }),
  ).toHaveValue("50");
  await page.getByRole("button", { name: "Save workout edits" }).click();
  await expect(page.getByText("All workout edits saved.")).toBeVisible();
  await page.getByLabel("Reps", { exact: true }).fill("10");
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/workout-logger-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Finish workout", exact: true })
    .click();
  await expect(page.getByText("Workout finished and saved.")).toBeVisible();
  await page.reload();
  await page.locator(".history-detail summary").click();
  await expect(page.getByText(/50 lb per dumbbell × 10 reps/)).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Progress", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Muscle heatmap" }),
  ).toBeVisible();
  expect(
    await page
      .locator("filter")
      .evaluateAll(
        (elements) =>
          new Set(elements.map((e) => e.id)).size === elements.length,
      ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/workout-progress-${test.info().project.name}.png`,
    fullPage: true,
  });
});
