begin;
-- Chest-focused variation described at https://learn.athleanx.com/articles/chest-workouts
-- Involvement values are illustrative catalog weights, not measured activation.
insert into public.exercises(id,name,equipment,instructions,tracking_mode,load_mode,training_category,e1rm_eligible)
values('cable-jackhammer-pushdown','Cable jackhammer pushdown (chest)','cable',
'Use a high cable and straight bar. Allow the elbows to travel up and out on the return, then press down with a controlled torso. Record the stack setting; pulley ratios vary by machine.',
'reps','external','push',false)
on conflict(id) do update set name=excluded.name,equipment=excluded.equipment,instructions=excluded.instructions,
tracking_mode=excluded.tracking_mode,load_mode=excluded.load_mode,training_category=excluded.training_category,e1rm_eligible=excluded.e1rm_eligible;
insert into public.exercise_muscles(exercise_id,muscle_id,involvement) values
('cable-jackhammer-pushdown','chest',1),('cable-jackhammer-pushdown','triceps',0.5),
('cable-jackhammer-pushdown','shoulders',0.5),('cable-jackhammer-pushdown','core',0.25)
on conflict(exercise_id,muscle_id) do update set involvement=excluded.involvement;
commit;
