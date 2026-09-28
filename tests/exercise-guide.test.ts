import { expect, it } from "vitest";
import { exercises } from "../src/components/muscle-map/model";
import { exerciseProfile, familyKey } from "../src/lib/exercise-guide";

const profile=(id:string)=>exerciseProfile(exercises.find(e=>e.id===id)!);
it("covers the catalog with valid profiles and navigable related exercises",()=>{
  for(const exercise of exercises) {
    const p=exerciseProfile(exercise);
    expect(p.name).toBeTruthy(); expect(p.cues.length).toBeGreaterThan(1);
    expect(p.primary.length).toBeGreaterThan(0);
    expect(p.dose.length).toBeGreaterThan(0);
    for(const link of [...p.pairs,...p.alternatives]) {
      expect(link.id).not.toBe(exercise.id);
      expect(exercises.some(e=>e.id===link.id)).toBe(true);
    }
  }
});
it("keeps specialist movements out of generic rep and superset advice",()=>{
  for(const id of ["power-clean","kettlebell-snatch","turkish-get-up","box-jump"]) {
    expect(profile(id).key).toBe("technical");
    expect(profile(id).pairs).toEqual([]);
    expect(profile(id).dose[0].sets).toBe("Individualized");
  }
  expect(profile("plank").dose[0].reps).toContain("seconds");
  expect(profile("farmer-carry").dose[0].reps).toContain("metres");
  expect(profile("tibialis-raise").primary).toEqual(["tibialis anterior (front of shin)"]);
});
it("distinguishes movements that share words",()=>{
  const cases={"lying-leg-curl":"legCurl","barbell-curl":"curl","cable-triceps-kickback":"triceps","cable-leg-kickback":"hip","upright-row":"shoulder","rowing-machine":"conditioning","single-arm-overhead-cable-extension":"triceps"};
  for(const [id,key] of Object.entries(cases)) expect(familyKey(exercises.find(e=>e.id===id)!)).toBe(key);
  expect(profile("barbell-bench-press").primary).toContain("chest");
  expect(profile("barbell-bench-press").pairs.map(e=>e.id)).toContain("seated-cable-row");
});
it("prioritizes session fit and explains order and fatigue for every pairing",()=>{
  expect(profile("barbell-bench-press").pairs[0].id).toBe("cable-triceps-pushdown");
  expect(profile("preacher-curl").pairs[0].id).toBe("seated-cable-row");
  expect(profile("preacher-curl").pairs[0].order).toContain("row first");
  expect(profile("barbell-back-squat").pairs.map(p=>p.id)).toEqual(["seated-leg-curl","dumbbell-lateral-raise"]);
  for (const exercise of exercises) for(const pair of profile(exercise.id).pairs) {
    expect(pair.style).toBeTruthy(); expect(pair.reason).toBeTruthy();
    expect(pair.order).toBeTruthy(); expect(pair.fatigue).toBeTruthy();
  }
  expect(profile("barbell-bench-press").pairs[1].style).toBe("Opposing-muscle alternative");
});
