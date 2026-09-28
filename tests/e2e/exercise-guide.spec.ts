import { expect, test } from "@playwright/test";
test("exercise profiles can be searched and linked on phone and desktop",async({page})=>{
  await page.goto("/workout");
  await page.getByRole("link",{name:"Browse exercise profiles"}).click();
  await page.getByLabel("Search exercise profiles").fill("barbell bench press");
  await page.getByRole("link",{name:"Barbell bench press",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Barbell bench press",exact:true})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Muscles involved"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Sets, reps & rest"})).toBeVisible();
  await page.getByRole("link",{name:"Seated cable row",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Seated cable row",exact:true})).toBeVisible();
  await page.goto("/exercises/power-clean");
  await expect(page.getByText("No automatic pairing is suggested.",{exact:false})).toBeVisible();
  await page.goto("/exercises/not-a-real-lift");
  await expect(page.getByRole("heading",{name:"Exercise not found"})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
