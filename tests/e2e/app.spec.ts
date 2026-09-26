import { test, expect } from "@playwright/test";
test("preview routes, map interaction, and mobile layout", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Build your momentum." }),
  ).toBeVisible();
  await expect(
    page.getByText("Foundation preview · sample content, no data is saved"),
  ).toBeVisible();
  for (const [route, title] of [
    ["Workout", "Your training ground."],
    ["Nutrition", "Good habits, one meal at a time."],
    ["Progress", "Small steps. Real progress."],
    ["Profile", "Your space."],
  ]) {
    await page
      .getByRole("navigation")
      .getByRole("link", { name: route, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  }
  await page.goto("/workout");
  await page.getByRole("button", { name: /Push-up/ }).click();
  await expect(page.locator('[data-muscle="chest"]')).toHaveAttribute(
    "fill",
    "#bce278",
  );
  await expect(page.getByRole("button", { name: /Push-up/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.goto("/auth");
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeDisabled();
  await page.goto("/unknown");
  await expect(
    page.getByRole("heading", { name: "Page not found." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
