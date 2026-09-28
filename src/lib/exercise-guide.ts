import { exercises, type Exercise } from "../components/muscle-map/model";
import { tracking } from "./workout";

type Family = { name: string; cues: string[]; avoid: string; purpose: string };
const families: Record<string, Family> = {
  squat: {name:"Squat / knee-dominant",purpose:"Train leg strength through knee and hip extension.",cues:["Keep your whole foot supported and knees tracking with your toes.","Lower only as far as you can maintain balance and a controlled trunk.","Stand smoothly; use rack safeties for loaded barbell variations."],avoid:"Bouncing out of a depth you cannot control or letting heels lift unintentionally."},
  lunge: {name:"Single-leg / split stance",purpose:"Build leg strength and balance with one side emphasized.",cues:["Choose a stance that lets you keep the working foot planted.","Control the lowering phase and keep the knee aligned with the foot.","Use support while learning; train both sides."],avoid:"Rushing transitions or pushing mostly from the trailing leg."},
  hinge: {name:"Hip hinge",purpose:"Train the posterior chain while maintaining a stable trunk.",cues:["Brace your trunk and move through your hips.","Keep the load close and use a range you can control.","Finish tall without leaning backward."],avoid:"Turning hip extension into repeated lower-back arching."},
  press: {name:"Upper-body press",purpose:"Develop pressing strength through the chest, shoulders, and triceps.",cues:["Establish a stable base before beginning each set.","Keep wrists aligned with the resistance and control the lowering phase.","Use a comfortable shoulder range; set safeties or use a spotter for heavy barbell work."],avoid:"Bouncing the weight or forcing a painful depth."},
  overhead: {name:"Overhead / angled press",purpose:"Develop shoulder and triceps pressing strength.",cues:["Keep ribs stacked over the pelvis rather than leaning back.","Let the shoulder blades move naturally as you press.","Use a comfortable grip and lower with control."],avoid:"Using a large lower-back arch to finish a rep."},
  row: {name:"Horizontal pull",purpose:"Train the upper back and elbow flexors.",cues:["Set your trunk or chest support before pulling.","Drive the elbows back without jerking the torso.","Return to a controlled reach rather than dropping the load."],avoid:"Turning every rep into a swing or shrug."},
  pull: {name:"Vertical pull / pullover",purpose:"Train pulling strength with emphasis on the lats.",cues:["Keep the trunk controlled and choose a comfortable grip.","Bring the upper arms toward the torso without momentum.","Control the return; do not force the shoulder at the end of its range."],avoid:"Using body swing to move resistance you cannot control."},
  curl: {name:"Elbow flexion",purpose:"Train the elbow flexors through a controlled curl.",cues:["Keep the upper arm steady for the chosen variation.","Curl without swinging your torso.","Lower fully within a comfortable elbow range."],avoid:"Using hip drive or bending the wrist to finish reps."},
  triceps: {name:"Elbow extension",purpose:"Train triceps strength with controlled elbow extension.",cues:["Stabilize the upper arm and choose a comfortable elbow position.","Extend smoothly without snapping the joint.","Control the return and keep the trunk steady."],avoid:"Moving the entire shoulder and torso instead of extending the elbow."},
  shoulder: {name:"Shoulder / scapular accessory",purpose:"Train shoulder or shoulder-blade control with a manageable load.",cues:["Use a light enough load to avoid swinging.","Move through the intended shoulder or shoulder-blade action.","Keep the neck relaxed and use a comfortable range."],avoid:"Chasing height or load when it changes the movement."},
  fly: {name:"Chest fly",purpose:"Train the chest by bringing the arms toward the midline.",cues:["Keep a slight, consistent bend in the elbows.","Use a controlled arc and a comfortable shoulder stretch.","Bring the arms together without bouncing at the bottom."],avoid:"Overstretching under a load you cannot control."},
  legCurl: {name:"Knee flexion",purpose:"Train the hamstrings by bending the knee.",cues:["Align yourself with the equipment and secure the pads when applicable.","Keep the hips controlled while bending the knees.","Use assistance for demanding bodyweight variations."],avoid:"Lifting or twisting the hips to shorten the movement."},
  extension: {name:"Knee extension",purpose:"Train quadriceps through controlled knee extension.",cues:["Align the machine pivot with the knee when using a machine.","Keep the hips supported and extend smoothly.","Lower with control and use a comfortable knee range."],avoid:"Kicking the load or snapping into lockout."},
  hip: {name:"Glute / hip accessory",purpose:"Train hip movement while limiting compensation through the trunk.",cues:["Stabilize your pelvis before moving.","Use the intended hip action without twisting the lower back.","Pause briefly where you can control the contraction."],avoid:"Using lumbar extension or momentum instead of hip movement."},
  calf: {name:"Ankle plantar flexion",purpose:"Train the calf muscles by raising the heel.",cues:["Keep pressure through the forefoot and rise smoothly.","Lower the heel slowly within a comfortable range.","Use support for balance so the ankle muscles do the work."],avoid:"Bouncing through the bottom or rolling onto the outside of the foot."},
  shin: {name:"Ankle dorsiflexion",purpose:"Train the tibialis anterior at the front of the shin.",cues:["Keep the heel supported.","Raise the forefoot toward the shin.","Lower slowly without rocking the whole body."],avoid:"Replacing ankle movement with hip or knee movement."},
  core: {name:"Trunk control",purpose:"Train the trunk to control or resist movement.",cues:["Set your ribs and pelvis before each repetition or hold.","Use a range or duration you can maintain while breathing.","End the set when you lose the intended trunk position."],avoid:"Extending the set by swinging or losing trunk control."},
  grip: {name:"Grip / forearm",purpose:"Develop grip and forearm capacity.",cues:["Use a secure grip and a manageable resistance.","Keep the intended wrist or hanging position controlled.","Stop before your grip fails unexpectedly."],avoid:"Dropping a load or losing support as the grip fatigues."},
  carry: {name:"Loaded carry",purpose:"Challenge grip, posture, and trunk control while moving.",cues:["Pick up the load with control and stand tall.","Take controlled steps without leaning or rushing.","Use a clear path and set the weight down before grip fails."],avoid:"Leaning toward one side or walking into an obstructed area."},
  technical: {name:"Power / technical movement",purpose:"Practice coordinated force production with technique as the priority.",cues:["Learn the exact variation with a qualified coach before loading heavily.","Use brief, high-quality practice bouts with full recovery.","Stop when speed, balance, or landing/catch quality deteriorates."],avoid:"Learning a complex movement through fatigued, high-repetition supersets."},
  conditioning: {name:"Conditioning",purpose:"Develop work capacity using an effort you can repeat consistently.",cues:["Start with an easy pace to establish the movement.","Keep effort controlled and recover between bouts.","Increase duration gradually before increasing intensity."],avoid:"Starting at an all-out pace that prevents controlled movement."},
};

export function familyKey(e: Exercise): string {
  const id=e.id;
  if (/clean|snatch|push-press|swing|thruster|turkish|box-jump|broad-jump/.test(id)) return "technical";
  if (/rowing-machine|ski-erg|assault-bike|sled|battle-ropes|jump-rope|burpee/.test(id)) return "conditioning";
  if (/carry|suitcase-march/.test(id)) return "carry";
  if (/tibialis/.test(id)) return "shin";
  if (/calf/.test(id)) return "calf";
  if (/leg-curl|lying-curl|seated-curl|hamstring-curl|glute-ham/.test(id)) return "legCurl";
  if (/leg-extension/.test(id)) return "extension";
  if (/lunge|split-squat|step-up/.test(id)) return "lunge";
  if (/squat|leg-press/.test(id)) return "squat";
  if (/deadlift|hinge|good-morning|rack-pull|back-extension/.test(id)) return "hinge";
  if (/hip-|glute-|kickback|frog-pump|hyperextension|pull-through|lateral-walk|monster-walk/.test(id) && !/triceps/.test(id)) return "hip";
  if (/wrist|plate-pinch|dead-hang/.test(id)) return "grip";
  if (/curl/.test(id)) return "curl";
  if (/triceps|skull|overhead.*extension/.test(id)) return "triceps";
  if (/upright-row|shrug|raise|rear-delt|reverse-fly|reverse-pec|face-pull/.test(id) && tracking[id].category !== "core") return "shoulder";
  if (/row/.test(id)) return "row";
  if (/pull-up|chin-up|pulldown|pullover/.test(id)) return "pull";
  if (/fly|crossover/.test(id)) return "fly";
  if (/overhead-press|shoulder-press|arnold|landmine-press/.test(id)) return "overhead";
  if (tracking[id].category === "core") return "core";
  return "press";
}

const specific: Record<string,string[]> = {
  "barbell-back-squat": ["Set the bar securely on the upper back and set rack safeties before unracking.","Brace, keep feet planted, and sit down between the hips to a depth you can control.","Stand while keeping the bar balanced over your feet; do not rush the walk back into the rack."],
  "conventional-deadlift": ["Set the bar close to the shins, roughly over the middle of the foot.","Brace and take tension through the arms before pushing the floor away.","Keep the bar close and finish standing tall. Reset rather than bouncing the bar between reps."],
  "lat-pulldown": ["Secure the thigh pad and use a comfortable grip.","Pull toward the upper chest with a stable torso, avoiding a behind-the-neck path.","Let the arms return upward under control without lifting off the seat."],
  "row": ["Support your free hand on a stable surface and keep your trunk steady.","Pull the elbow toward the hip without rotating the torso to lift the dumbbell.","Lower with control and repeat on both sides. Log the weight of the working dumbbell."],
  "pull-up": ["Begin from a controlled hang with a secure grip.","Pull your body upward without kicking or craning the neck to reach the bar.","Lower with control; use assistance if you cannot repeat clean reps."],
  "leg-press": ["Adjust the seat so your pelvis stays supported through the chosen depth.","Keep feet planted and knees tracking with your toes.","Press smoothly without snapping the knees; use the machine's stops and locking mechanism."],
  "dumbbell-lateral-raise": ["Use light dumbbells with a small bend in the elbows.","Raise the arms in a comfortable plane slightly forward of the torso.","Stop at a comfortable height, usually around shoulder level, and lower without swinging."],
  "barbell-curl": ["Stand with the bar in a comfortable underhand grip.","Keep the upper arms steady as you bend the elbows.","Lower slowly without leaning back to move the weight."],
  "cable-triceps-pushdown": ["Set the cable high and take a stable stance.","Keep elbows close to the torso and extend them without pressing with the whole shoulder.","Control the return while keeping wrists aligned with the handle."],
  "barbell-bench-press": ["Set the rack so you can unrack without losing your upper-back position.","Keep feet planted and lower the bar toward the chest with forearms roughly vertical.","Press back up with a controlled bar path; use a spotter or correctly positioned safeties."],
  "hinge": ["Start standing with a soft knee bend and the weight close to the thighs.","Push the hips back; stop lowering when further depth would change your back position.","Bring the hips forward to stand. The weight does not need to reach the floor."],
  "plank": ["Place elbows beneath the shoulders and support yourself on forearms and toes.","Keep a long line from head through heels while breathing.","End the hold before the hips sag or rise."],
  "dumbbell-shoulder-press": ["Start with dumbbells near shoulder height and wrists stacked over elbows.","Press in a comfortable arc without leaning backward.","Lower each dumbbell under control; record the weight of one dumbbell."],
};

export function exerciseProfile(e: Exercise) {
  const key=familyKey(e), info=tracking[e.id];
  const entries=Object.entries(e.muscles);
  let primary=entries.filter(([,v])=>v>=0.75).map(([m])=>m.replaceAll("_"," "));
  let secondary=entries.filter(([,v])=>v>=0.4&&v<0.75).map(([m])=>m.replaceAll("_"," "));
  let stabilizers=entries.filter(([,v])=>v>0&&v<0.4).map(([m])=>m.replaceAll("_"," "));
  if(key === "shin") { primary=["tibialis anterior (front of shin)"]; secondary=[]; stabilizers=[]; }
  if(key === "hinge" && primary.length>1 && primary.includes("lower back")) {primary=primary.filter(m=>m!=="lower back");stabilizers=[...stabilizers,"lower back"];}
  const special=key === "technical" || key === "conditioning";
  const dose=special ? [{goal:"Technique / pacing",sets:"Individualized",reps:"Short quality bouts",rest:"Recover fully"}]
    : info.mode === "time" ? [{goal:"Control",sets:"2–3",reps:"10–30 seconds",rest:"60–90 seconds"}]
    : info.mode === "distance" ? [{goal:"Distance practice",sets:"2–3",reps:"10–30 metres",rest:"60–120 seconds"}]
    : [{goal:"Learn the movement",sets:"1–2",reps:"8–12",rest:"1–2 minutes"},
       {goal:"Build muscle",sets:"2–3",reps:"8–15",rest:"1–3 minutes"},
       ...(info.e1rm ? [{goal:"Strength (experienced)",sets:"2–3",reps:"3–6",rest:"2–3+ minutes"}] : [])];
  type PairIdea = { id: string; style: string; reason: string; order: string; fatigue: string };
  const pool: PairIdea[] = [];
  const add = (id: string, style: string, reason: string, order: string, fatigue: string) => pool.push({id,style,reason,order,fatigue});
  const pushFatigue = "Both movements involve the triceps. Fatiguing them can reduce pressing performance; use moderate loads and keep heavy pressing separate.";
  const pullFatigue = "Both movements involve the elbow flexors. Biceps and grip fatigue may reduce pulling performance; keep heavy pulling separate.";
  if (!special && !["hinge","carry"].includes(key)) {
    if (["press","fly","overhead"].includes(key)) {
      add("cable-triceps-pushdown", "Push-session pairing", "Keeps chest or shoulder work and a triceps accessory together in a push session.", "Perform the main press or chest exercise first, then the pushdown.", pushFatigue);
      add("seated-cable-row", "Opposing-muscle alternative", "Alternates pressing/chest work with a back-focused pull for a mixed upper-body session.", "Put the exercise you most want to improve first.", "Different emphasis does not mean full recovery: shoulders, grip, and trunk still work in both movements.");
    } else if (key === "triceps") {
      add("machine-chest-press", "Push-session pairing", "Pairs a triceps accessory with chest pressing in the same push session.", "Perform the chest press first, then this triceps exercise.", pushFatigue);
      add("cable-curl", "Opposing-muscle alternative", "Alternates elbow extension with elbow flexion for an arm-focused session.", "Put the priority arm exercise first.", "Elbow and grip fatigue can still accumulate; keep both movements controlled.");
    } else if (["row","pull"].includes(key)) {
      add("cable-curl", "Pull-session pairing", "Combines a back-focused movement with a biceps accessory in a pull session.", "Perform the back exercise first, then the curl.", pullFatigue);
      add("machine-chest-press", "Opposing-muscle alternative", "Alternates back work with chest pressing for a mixed upper-body session.", "Put the exercise you most want to improve first.", "Shoulder, grip, and trunk fatigue can carry over even with different primary muscles.");
    } else if (key === "curl") {
      add("seated-cable-row", "Pull-session pairing", "Groups this biceps exercise with a back movement that also uses the elbow flexors.", "Perform the row first, then this curl.", pullFatigue);
      add("cable-triceps-pushdown", "Opposing-muscle alternative", "Alternates biceps and triceps work in an arm-focused session.", "Put the priority arm exercise first.", "Both exercises load the elbow region; reduce effort if technique deteriorates.");
    } else if (["squat","lunge","extension","legCurl","hip","calf"].includes(key)) {
      const kneeFlexion = ["squat","lunge","extension"].includes(key);
      add(kneeFlexion ? "seated-leg-curl" : "leg-extension", "Leg-session pairing", kneeFlexion ? "Adds hamstring knee-flexion work alongside a knee-dominant leg movement." : "Adds quadriceps knee-extension work alongside this posterior-chain or calf movement.", "Do the compound movement first when present; otherwise put the priority exercise first.", "Both tax the lower body. Use straight sets for heavy compounds and allow extra rest if leg performance drops.");
      add("dumbbell-lateral-raise", "Optional legs + shoulders", "Adds a light shoulder accessory when your session intentionally combines legs and shoulders.", "Do the leg exercise first, then a light lateral raise.", "Breathing and trunk fatigue still carry over. Skip the pairing if you cannot stay stable for the raises.");
    } else if (key === "shoulder") {
      add("leg-extension", "Optional shoulders + legs", "Combines a shoulder accessory with supported quadriceps work in a mixed session.", "Put your priority exercise first and keep both moderate.", "This is a mixed-session option, not a default push or pull pairing. Rest enough to keep posture controlled.");
    }
  }
  const pairs=pool.filter(p=>p.id!==e.id).flatMap(p=>{
    const exercise=exercises.find(x=>x.id===p.id);
    return exercise ? [{...exercise, ...p}] : [];
  });
  const alternatives=exercises.filter(x=>x.id!==e.id&&familyKey(x)===key&&tracking[x.id].mode===info.mode).sort((a,b)=>{
    const overlap=(x:Exercise)=>Object.entries(x.muscles).reduce((s,[m,v])=>s+v*(e.muscles[m as keyof typeof e.muscles]??0),0);
    return overlap(b)-overlap(a)||a.name.localeCompare(b.name);
  }).slice(0,3);
  return {key,...families[key],primary,secondary,stabilizers,dose,pairs,alternatives,cues:specific[e.id]??families[key].cues,specific:Boolean(specific[e.id])};
}
