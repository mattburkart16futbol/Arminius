import { test, expect } from "@playwright/test";
test.use({ baseURL: "http://127.0.0.1:4174" });
test("search, portions, favorites, retained drafts, multi-food save, edit and delete", async ({
  page,
}) => {
  const uid = "10000000-0000-4000-8000-000000000001";
  const food = {
    id: "20000000-0000-4000-8000-000000000001",
    name: "Oats, cooked",
    brand: null,
    serving_grams: 100,
    serving_amount: 100,
    serving_unit: "g",
    calories: 200,
    protein_g: 10,
    carbs_g: 25,
    fat_g: 8,
    fiber_g: null,
    sugar_g: 0,
    saturated_fat_g: null,
    sodium_mg: 100,
    potassium_mg: null,
    source: "USDA FoodData Central",
    source_id: "123",
    source_url: "https://fdc.nal.usda.gov/food-details/123/nutrients",
    source_release: "2026-04-30",
    source_data_type: "Foundation",
    portions: [{ label: "1 cup", amount: 40, unit: "g" }],
  };
  const nutrientKeys = [
    "calories",
    "protein_g",
    "carbs_g",
    "fat_g",
    "fiber_g",
    "sugar_g",
    "saturated_fat_g",
    "sodium_mg",
    "potassium_mg",
  ];
  let meals: Record<string, unknown>[] = [];
  let items: Record<string, unknown>[] = [];
  let favorite = false;
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
    const path = new URL(route.request().url()).pathname,
      body = route.request().postDataJSON();
    let result: unknown = [];
    if (path.endsWith("/rpc/search_foods")) result = [food];
    else if (path.endsWith("/food_favorites")) {
      if (route.request().method() === "DELETE") favorite = false;
      else if (body) favorite = true;
      result = favorite ? [{ food_id: food.id, foods: food }] : [];
    } else if (path.endsWith("/rpc/save_meal")) {
      const prior = meals.find((m) => m.id === body.p_id);
      expect(body.p_expected_revision).toBe(prior?.revision ?? 0);
      const nextItems = body.p_items.map((i: Record<string, unknown>) => {
        const snapshot = items.find((s) => s.id === i.snapshot_id);
        const source: Record<string, unknown> =
          snapshot ??
          (i.food_id ? food : (i.nutrients as Record<string, unknown>));
        const quantity = Number(i.quantity);
        const quantityUnit = String(i.quantity_unit);
        const factor = i.food_id || snapshot
          ? quantity / Number(snapshot?.quantity ?? food.serving_amount)
          : 1;
        return {
          id: crypto.randomUUID(),
          meal_id: body.p_id,
          food_id: i.food_id ?? snapshot?.food_id ?? null,
          name: source.name ?? i.name,
          quantity,
          quantity_unit: quantityUnit,
          quantity_grams: quantityUnit === "g" ? quantity : null,
          source_snapshot: i.food_id
            ? { source: food.source, url: food.source_url }
            : (snapshot?.source_snapshot ?? null),
          ...Object.fromEntries(
            nutrientKeys.map((n) => [
              n,
              source[n] == null ? null : Number(source[n]) * factor,
            ]),
          ),
        };
      });
      const revision = Number(prior?.revision ?? 0) + 1;
      meals = [
        ...meals.filter((m) => m.id !== body.p_id),
        {
          id: body.p_id,
          name: body.p_name,
          eaten_at: body.p_eaten_at,
          revision,
        },
      ];
      items = [...items.filter((i) => i.meal_id !== body.p_id), ...nextItems];
      result = revision;
    } else if (path.endsWith("/rpc/delete_meal")) {
      meals = meals.filter((m) => m.id !== body.p_id);
      items = items.filter((i) => i.meal_id !== body.p_id);
      result = null;
    } else if (path.endsWith("/meals")) result = meals;
    else if (path.endsWith("/meal_items")) result = items;
    await route.fulfill({ json: result });
  });
  await page.goto("/nutrition");
  await page.getByText("Add food", { exact: true }).click();
  await page.getByLabel("Meal name", { exact: true }).fill("Breakfast");
  await page.getByLabel("Search food catalog").fill("oats");
  await page.getByRole("button", { name: "Search foods", exact: true }).click();
  await page
    .getByRole("button", { name: "Favorite Oats, cooked", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Unfavorite Oats, cooked", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /Oats, cooked\s+200 kcal/ }).click();
  await page.getByLabel("Source serving size").selectOption("40");
  await expect(page.getByLabel("Portion (g)")).toHaveValue("40");
  await page.getByLabel("Portion (g)").fill("80");
  await page.getByRole("button", { name: "Add to meal", exact: true }).click();
  await page.getByLabel("Food name", { exact: true }).fill("Yogurt label");
  for (const [label, value] of [
    ["calories", "100"],
    ["protein g", "10"],
    ["carbs g", "12"],
    ["fat g", "2"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole("button", { name: "Add to meal", exact: true }).click();
  await expect(page.getByText("260 kcal in this meal")).toBeVisible();
  await page.goto("/profile");
  await page.goto("/nutrition");
  await expect(page.getByText("260 kcal in this meal")).toBeVisible();
  await expect(page.getByLabel("Meal name", { exact: true })).toHaveValue(
    "Breakfast",
  );
  await page.getByRole("button", { name: "Save meal", exact: true }).click();
  await expect(page.getByText("Meal saved.", { exact: true })).toBeVisible();
  expect(items).toHaveLength(2);
  expect(items.reduce((s, i) => s + Number(i.calories), 0)).toBe(260);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Portion for item 1 (g)").fill("160");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Meal saved.", { exact: true })).toBeVisible();
  await expect.poll(() => Number(meals[0]?.revision)).toBe(2);
  expect(items.reduce((s, i) => s + Number(i.calories), 0)).toBe(420);
  await page
    .getByRole("button", { name: "Use meal again", exact: true })
    .click();
  await expect(page.getByText("420 kcal in this meal")).toBeVisible();
  await page
    .getByRole("button", { name: "Discard draft", exact: true })
    .click();
  await page.screenshot({
    path: `test-results/food-library-${test.info().project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Keep meal", exact: true }).click();
  expect(meals).toHaveLength(1);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete this meal", exact: true })
    .click();
  await expect(page.getByText("Meal deleted.", { exact: true })).toBeVisible();
  expect(meals).toHaveLength(0);
  expect(items).toHaveLength(0);
  expect(errors).toEqual([]);
});
