import { Router } from 'express';
import { one, all, run, tx } from '../db.js';
import { h, bad, notFound, requireFields } from '../lib/http.js';
import { now, isValidDate } from '../lib/time.js';
import { allow, STAFF } from '../middleware.js';

const r = Router();
r.use(allow(...STAFF));
const coach = allow('dono', 'professor');

r.get('/exercises', h((req) => all('SELECT * FROM exercises WHERE gym_id IS NULL OR gym_id = ? ORDER BY muscle, name', req.gym.id)));

r.post(
  '/exercises',
  coach,
  h((req) => {
    requireFields(req.body, ['name', 'muscle']);
    const id = run('INSERT INTO exercises (gym_id, name, muscle, equipment) VALUES (?,?,?,?)', req.gym.id, req.body.name, req.body.muscle, req.body.equipment || null).lastInsertRowid;
    return one('SELECT * FROM exercises WHERE id = ?', id);
  })
);

export function workoutFull(id) {
  const w = one('SELECT * FROM workouts WHERE id = ?', id);
  if (!w) return null;
  w.items = all(
    `SELECT i.*, e.name AS exercise_name, e.muscle, e.equipment FROM workout_items i JOIN exercises e ON e.id = i.exercise_id
      WHERE i.workout_id = ? ORDER BY i.division, i.position`,
    id
  );
  w.divisions = [...new Set(w.items.map((i) => i.division))];
  return w;
}

r.get(
  '/workouts',
  h((req) =>
    all(
      `SELECT w.*, m.name AS member_name, u.name AS coach_name,
              (SELECT MAX(done_at) FROM workout_sessions s WHERE s.workout_id = w.id) AS last_session,
              (SELECT COUNT(*) FROM workout_sessions s WHERE s.workout_id = w.id) AS sessions
         FROM workouts w JOIN members m ON m.id = w.member_id LEFT JOIN users u ON u.id = w.created_by
        WHERE w.gym_id = ? AND w.active = 1 ORDER BY w.valid_until`,
      req.gym.id
    )
  )
);

r.get(
  '/workouts/:id',
  h((req) => {
    const w = workoutFull(req.params.id);
    if (!w || w.gym_id !== req.gym.id) throw notFound('Treino');
    w.member = one('SELECT id, name, birth_date FROM members WHERE id = ?', w.member_id);
    return w;
  })
);

function saveItems(workoutId, items) {
  if (!Array.isArray(items) || items.length === 0) throw bad('Adicione ao menos um exercício');
  run('DELETE FROM workout_items WHERE workout_id = ?', workoutId);
  items.forEach((it, idx) => {
    if (!/^[A-F]$/.test(it.division)) throw bad('Divisão deve ser de A a F');
    if (!(it.sets >= 1 && it.sets <= 10)) throw bad('Séries entre 1 e 10');
    if (!it.reps) throw bad('Informe as repetições (ex.: 10-12 ou 30s)');
    run(
      'INSERT INTO workout_items (workout_id, division, position, exercise_id, sets, reps, load_kg, rest_sec, notes) VALUES (?,?,?,?,?,?,?,?,?)',
      workoutId,
      it.division,
      idx,
      it.exercise_id,
      it.sets,
      String(it.reps),
      it.load_kg ?? null,
      it.rest_sec ?? 60,
      it.notes || null
    );
  });
}

/** Uma ficha ativa por aluno: criar uma nova arquiva a anterior. */
r.post(
  '/workouts',
  coach,
  h((req) => {
    const b = req.body || {};
    requireFields(b, ['member_id', 'name', 'items']);
    if (!one('SELECT id FROM members WHERE id = ? AND gym_id = ?', b.member_id, req.gym.id)) throw notFound('Aluno');
    if (b.valid_until && !isValidDate(b.valid_until)) throw bad('Validade inválida');
    return tx(() => {
      run('UPDATE workouts SET active = 0 WHERE member_id = ? AND active = 1', b.member_id);
      const id = run(
        'INSERT INTO workouts (gym_id, member_id, name, goal, valid_until, created_by, created_at) VALUES (?,?,?,?,?,?,?)',
        req.gym.id,
        b.member_id,
        b.name,
        b.goal || null,
        b.valid_until || null,
        req.user.id,
        now()
      ).lastInsertRowid;
      saveItems(id, b.items);
      return workoutFull(id);
    });
  })
);

r.put(
  '/workouts/:id',
  coach,
  h((req) => {
    const w = one('SELECT * FROM workouts WHERE id = ? AND gym_id = ?', req.params.id, req.gym.id);
    if (!w) throw notFound('Treino');
    return tx(() => {
      run('UPDATE workouts SET name = ?, goal = ?, valid_until = ? WHERE id = ?', req.body.name ?? w.name, req.body.goal ?? w.goal, req.body.valid_until ?? w.valid_until, w.id);
      if (req.body.items) saveItems(w.id, req.body.items);
      return workoutFull(w.id);
    });
  })
);

// ---------- Dietas ----------
export function dietFull(id) {
  const d = one('SELECT * FROM diets WHERE id = ?', id);
  if (!d) return null;
  d.meals = all('SELECT * FROM diet_meals WHERE diet_id = ? ORDER BY position', id).map((m) => ({
    ...m,
    items: all('SELECT * FROM diet_items WHERE meal_id = ? ORDER BY id', m.id),
  }));
  const sum = (k) => Math.round(d.meals.reduce((s, m) => s + m.items.reduce((a, i) => a + i[k], 0), 0));
  d.totals = { kcal: sum('kcal'), protein_g: sum('protein_g'), carbs_g: sum('carbs_g'), fat_g: sum('fat_g') };
  return d;
}

r.get(
  '/diets',
  h((req) =>
    all(
      `SELECT d.*, m.name AS member_name FROM diets d JOIN members m ON m.id = d.member_id WHERE d.gym_id = ? AND d.active = 1 ORDER BY m.name`,
      req.gym.id
    ).map((d) => ({ ...d, totals: dietFull(d.id).totals }))
  )
);

r.get(
  '/diets/:id',
  h((req) => {
    const d = dietFull(req.params.id);
    if (!d || d.gym_id !== req.gym.id) throw notFound('Dieta');
    d.member = one('SELECT id, name FROM members WHERE id = ?', d.member_id);
    return d;
  })
);

r.post(
  '/diets',
  coach,
  h((req) => {
    const b = req.body || {};
    requireFields(b, ['member_id', 'name', 'meals']);
    if (!one('SELECT id FROM members WHERE id = ? AND gym_id = ?', b.member_id, req.gym.id)) throw notFound('Aluno');
    if (!Array.isArray(b.meals) || !b.meals.length) throw bad('Adicione ao menos uma refeição');
    return tx(() => {
      run('UPDATE diets SET active = 0 WHERE member_id = ? AND active = 1', b.member_id);
      const id = run(
        'INSERT INTO diets (gym_id, member_id, name, kcal_target, notes, created_by, created_at) VALUES (?,?,?,?,?,?,?)',
        req.gym.id,
        b.member_id,
        b.name,
        b.kcal_target || null,
        b.notes || null,
        req.user.id,
        now()
      ).lastInsertRowid;
      b.meals.forEach((m, i) => {
        if (!m.name) throw bad('Toda refeição precisa de nome');
        const mid = run('INSERT INTO diet_meals (diet_id, position, name, time) VALUES (?,?,?,?)', id, i, m.name, m.time || null).lastInsertRowid;
        for (const it of m.items || []) {
          if (!it.food || !it.qty) throw bad(`Alimento e quantidade obrigatórios em "${m.name}"`);
          run(
            'INSERT INTO diet_items (meal_id, food, qty, kcal, protein_g, carbs_g, fat_g) VALUES (?,?,?,?,?,?,?)',
            mid,
            it.food,
            it.qty,
            Number(it.kcal) || 0,
            Number(it.protein_g) || 0,
            Number(it.carbs_g) || 0,
            Number(it.fat_g) || 0
          );
        }
      });
      return dietFull(id);
    });
  })
);

export default r;
