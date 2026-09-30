import { test, expect } from "@playwright/test";

test("text preview works without AI requests and invalidates edited input", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:"))
      external.push(request.url());
  });
  await page.goto("/workout");
  await page
    .getByLabel("Workout text", { exact: true })
    .fill("Bench: 135 lb x 10\nDB shoulder press: 3 sets of 10 at 40 lb");
  await page.getByRole("button", { name: "Review workout text" }).click();
  await expect(
    page.getByRole("heading", { name: "Review draft sets" }),
  ).toBeVisible();
  await expect(
    page.getByText("Weight per dumbbell", { exact: false }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add draft sets to workout" }),
  ).toBeDisabled();
  await page
    .getByLabel("Workout text", { exact: true })
    .fill("Bench: three plates x 10");
  await expect(
    page.getByRole("heading", { name: "Review draft sets" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Review workout text" }).click();
  await expect(page.getByText(/Line 1: Use/)).toBeVisible();
  expect(external).toEqual([]);
});

test("reviewed text appends draft sets without saving or completing them", async ({
  page,
}) => {
  const uid = "10000000-0000-4000-8000-000000000001";
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
  let saves = 0;
  await page.route("https://arminius-test.invalid/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let result: unknown = [];
    if (path.includes("/auth/"))
      result = { id: uid, email: "test@example.invalid" };
    if (path.endsWith("/profiles")) result = { unit_system: "imperial" };
    if (path.endsWith("/rpc/save_workout")) {
      saves++;
      result = {
        revision: 1,
        started_at: new Date().toISOString(),
        ended_at: null,
      };
    }
    await route.fulfill({ json: result });
  });
  await page.goto("http://127.0.0.1:4174/workout");
  await page
    .getByRole("button", { name: "Start workout", exact: true })
    .click();
  await expect(page.getByText("All workout edits saved.")).toBeVisible();
  await page
    .getByLabel("Workout text", { exact: true })
    .fill("DB shoulder press: 3 sets of 10 at 40 lb");
  await page.getByRole("button", { name: "Review workout text" }).click();
  await page.getByRole("button", { name: "Add draft sets to workout" }).click();
  await expect(page.locator(".workout-exercise-card")).toHaveCount(1);
  await expect(
    page
      .locator(".workout-exercise-card")
      .getByRole("button", { name: /Complete & save set/ }),
  ).toHaveCount(3);
  expect(saves).toBe(1);
  const draft = await page.evaluate(
    (uid) => JSON.parse(sessionStorage.getItem(`arminius-draft:${uid}`)!),
    uid,
  );
  expect(
    draft.exercises[0].sets.every(
      (s: { completed_at: unknown }) => s.completed_at === null,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Add draft sets to workout" }),
  ).toHaveCount(0);
});

test("AI review preserves notes and requires confirmation without downloading in CI", async ({
  page,
}) => {
  await page.addInitScript(() => {
    class FakeWorker {
      onmessage: ((event: { data: unknown }) => void) | null = null;
      onerror = null;
      postMessage() {
        setTimeout(
          () =>
            this.onmessage?.({
              data: {
                status: "complete",
                raw: JSON.stringify({
                  lines: [
                    {
                      exercise_id: "incline-barbell-bench-press",
                      sets: "4 sets of 7 at 135 lb",
                    },
                  ],
                  questions: [],
                }),
              },
            }),
          20,
        );
      }
      terminate() {}
    }
    Object.defineProperty(window, "Worker", { value: FakeWorker });
  });
  await page.goto("/workout");
  const notes = page.getByLabel("Workout text", { exact: true });
  await notes.fill("I did incline bench, four sets of seven with 135 pounds.");
  await page
    .getByText("Try free local AI (experimental)", { exact: true })
    .click();
  await page.getByRole("button", { name: "Download / run local AI" }).click();
  await expect(
    page.getByRole("heading", { name: "Review draft sets" }),
  ).toBeVisible();
  await expect(
    page.getByLabel(
      "I checked all exercises, weights, reps and sets against my notes.",
    ),
  ).not.toBeChecked();
  await expect(notes).toHaveValue(
    "I did incline bench, four sets of seven with 135 pounds.",
  );
  await notes.fill("Changed my notes");
  await expect(
    page.getByRole("heading", { name: "Review draft sets" }),
  ).toHaveCount(0);
});
