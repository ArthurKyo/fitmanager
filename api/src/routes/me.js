import { Router } from 'express';
import { one, all, run } from '../db.js';
import { h, bad, notFound, forbidden } from '../lib/http.js';
import { today, now, addDays, age } from '../lib/time.js';
import { accessQR } from '../lib/auth.js';
import { situation } from '../domain/members.js';
import { invoiceView } from '../domain/billing.js';
import { workoutFull, dietFull } from './training.js';
import { pixFor } from './finance.js';
import { checkout, saveCard, payWithCard, simulatePaid } from '../payments/service.js';
import { guideFor } from '../domain/exercise-guide.js';

/** API do app do aluno. Tudo é do próprio aluno logado; nunca recebe member_id de fora. */
const r = Router();
r.use((req, _res, next) => {
  if (req.user.role !== 'aluno' || !req.user.member_id) return next(forbidden('Área exclusiva do aluno'));
  req.member = one('SELECT * FROM members WHERE id = ? AND gym_id = ?', req.user.member_id, req.gym.id);
  if (!req.member) return next(notFound('Aluno'));
  next();
});

r.get(
  '/',
  h((req) => {
    const m = req.member;
    const s = situation(m, req.gym);
    const on = today();
    const next = one(`SELECT * FROM invoices WHERE member_id = ? AND status = 'pendente' ORDER BY due_date LIMIT 1`, m.id);
    const days = all(
      `SELECT DISTINCT substr(created_at,1,10) AS d FROM access_logs WHERE member_id = ? AND granted = 1 AND direction='entrada' AND created_at >= ? ORDER BY d`,
      m.id,
      addDays(on, -62)
    ).map((r) => r.d);
    // sequência de semanas com ao menos 3 treinos (mais honesto que "dias seguidos" para quem treina 3–5x)
    let weeks = 0;
    for (let w = 0; w < 9; w++) {
      const end = addDays(on, -7 * w);
      const start = addDays(end, -6);
      const n = days.filter((d) => d >= start && d <= end).length;
      if (n >= 3) weeks++;
      else if (w > 0) break;
    }
    return {
      member: { id: m.id, name: m.name, age: age(m.birth_date), medical_valid_until: m.medical_valid_until },
      gym: { name: req.gym.name, open_hour: req.gym.open_hour, close_hour: req.gym.close_hour, phone: req.gym.phone },
      situation: { key: s.key, label: s.label },
      contract: s.contract ? { plan_name: s.contract.plan_name, end_date: s.contract.end_date, hour_start: s.contract.hour_start, hour_end: s.contract.hour_end } : null,
      next_invoice: next ? invoiceView(next) : null,
      visit_days: days,
      month_visits: days.filter((d) => d.slice(0, 7) === on.slice(0, 7)).length,
      steady_weeks: weeks,
    };
  })
);

r.get(
  '/workout',
  h((req) => {
    const w = one('SELECT id FROM workouts WHERE member_id = ? AND active = 1', req.member.id);
    if (!w) return { workout: null };
    const full = workoutFull(w.id);
    const sessions = all('SELECT * FROM workout_sessions WHERE workout_id = ? ORDER BY done_at DESC LIMIT 20', w.id);
    const last = sessions[0];
    const idx = last ? full.divisions.indexOf(last.division) : -1;
    const suggested = full.divisions[(idx + 1) % full.divisions.length];
    const doneToday = sessions.filter((s) => s.done_at.slice(0, 10) === today()).map((s) => s.division);
    return { workout: full, suggested, sessions, done_today: doneToday, expired: full.valid_until && full.valid_until < today() };
  })
);

r.post(
  '/sessions',
  h((req) => {
    const w = one('SELECT * FROM workouts WHERE member_id = ? AND active = 1', req.member.id);
    if (!w) throw bad('Você ainda não tem ficha. Fale com o professor.');
    const division = String(req.body?.division || '');
    if (!one('SELECT id FROM workout_items WHERE workout_id = ? AND division = ?', w.id, division)) throw bad('Divisão inexistente na sua ficha');
    const dup = one(`SELECT id FROM workout_sessions WHERE workout_id = ? AND division = ? AND substr(done_at,1,10) = ?`, w.id, division, today());
    if (dup) throw bad(`Treino ${division} já registrado hoje`);
    const effort = Number(req.body?.effort);
    run(
      'INSERT INTO workout_sessions (member_id, workout_id, division, done_at, duration_min, effort) VALUES (?,?,?,?,?,?)',
      req.member.id,
      w.id,
      division,
      now(),
      Number(req.body?.duration_min) || null,
      effort >= 1 && effort <= 10 ? effort : null
    );
    return { ok: true };
  })
);

r.get(
  '/diet',
  h((req) => {
    const d = one('SELECT id FROM diets WHERE member_id = ? AND active = 1', req.member.id);
    return { diet: d ? dietFull(d.id) : null };
  })
);

r.get(
  '/invoices',
  h((req) =>
    all(`SELECT * FROM invoices WHERE member_id = ? AND status != 'cancelado' ORDER BY due_date DESC LIMIT 36`, req.member.id).map((i) => invoiceView(i))
  )
);

r.get(
  '/invoices/:id/pix',
  h((req) => {
    const inv = one('SELECT * FROM invoices WHERE id = ? AND member_id = ?', req.params.id, req.member.id);
    if (!inv) throw notFound('Fatura');
    if (inv.status !== 'pendente') throw bad('Esta fatura não está em aberto');
    if (!req.gym.pix_key) throw bad('A academia ainda não ativou o Pix. Pague na recepção.');
    return pixFor(req.gym, inv);
  })
);

r.get('/access-qr', h((req) => accessQR(req.member.id)));

// ---------- Guia de execução ----------
r.get(
  '/exercises/:id',
  h((req) => {
    const ex = one('SELECT * FROM exercises WHERE id = ? AND (gym_id IS NULL OR gym_id = ?)', req.params.id, req.gym.id);
    if (!ex) throw notFound('Exercício');
    const last = one(
      `SELECT i.load_kg, i.sets, i.reps FROM workout_items i JOIN workouts w ON w.id = i.workout_id
        WHERE w.member_id = ? AND i.exercise_id = ? ORDER BY w.created_at DESC LIMIT 1`,
      req.member.id,
      ex.id
    );
    return { ...ex, guide: guideFor(ex.name), prescription: last || null };
  })
);

// ---------- Perfil físico ----------
r.put(
  '/profile',
  h((req) => {
    const w = Number(req.body?.weight_kg);
    const hgt = Number(req.body?.height_cm);
    if (req.body?.weight_kg !== undefined && !(w >= 30 && w <= 300)) throw bad('Peso entre 30 e 300 kg');
    if (req.body?.height_cm !== undefined && !(hgt >= 120 && hgt <= 230)) throw bad('Altura entre 120 e 230 cm');
    const ig = req.body?.instagram !== undefined ? String(req.body.instagram).replace(/^@/, '').trim().slice(0, 40) || null : req.member.instagram;
    run(
      'UPDATE members SET weight_kg = ?, height_cm = ?, instagram = ? WHERE id = ?',
      req.body?.weight_kg !== undefined ? w : req.member.weight_kg,
      req.body?.height_cm !== undefined ? hgt : req.member.height_cm,
      ig,
      req.member.id
    );
    return { ok: true };
  })
);

// ---------- Cardio ----------
// MET por modalidade (Compendium of Physical Activities), ajustado pela velocidade quando há distância.
const MET = { caminhada: 3.5, corrida: 9.8, bike: 7.0, esteira: 4.0, eliptico: 5.0, escada: 8.0, remo: 7.0 };
function kcalFor({ kind, distance_m, duration_s, weight_kg }) {
  const kg = weight_kg || 70;
  const h = duration_s / 3600;
  let met = MET[kind] || 5;
  if (distance_m > 0 && duration_s > 0 && ['corrida', 'caminhada', 'bike'].includes(kind)) {
    const kmh = distance_m / 1000 / h;
    if (kind === 'corrida') met = Math.max(6, Math.min(16, kmh * 1.0)); // ~1 MET por km/h
    if (kind === 'caminhada') met = kmh < 4 ? 2.8 : kmh < 5.5 ? 3.5 : kmh < 6.5 ? 4.3 : 5.5;
    if (kind === 'bike') met = kmh < 16 ? 4 : kmh < 20 ? 6.8 : kmh < 25 ? 8 : 10;
  }
  return Math.round(met * kg * h);
}

r.get(
  '/cardio',
  h((req) => {
    const rows = all('SELECT id, kind, mode, distance_m, duration_s, kcal, avg_pace_s_km, elevation_m, started_at FROM cardio_sessions WHERE member_id = ? ORDER BY started_at DESC LIMIT 60', req.member.id);
    const month = today().slice(0, 7);
    const m = rows.filter((r) => r.started_at.startsWith(month));
    const best = one(`SELECT MAX(distance_m) AS d FROM cardio_sessions WHERE member_id = ? AND kind IN ('corrida','caminhada')`, req.member.id)?.d || 0;
    return {
      items: rows,
      month: { sessions: m.length, distance_m: m.reduce((s, r) => s + r.distance_m, 0), duration_s: m.reduce((s, r) => s + r.duration_s, 0), kcal: m.reduce((s, r) => s + (r.kcal || 0), 0) },
      best_distance_m: best,
      weight_kg: req.member.weight_kg,
    };
  })
);

r.post(
  '/cardio',
  h((req) => {
    const b = req.body || {};
    if (!MET[b.kind]) throw bad('Modalidade inválida');
    const mode = b.mode === 'gps' ? 'gps' : 'manual';
    const duration_s = Math.round(Number(b.duration_s));
    const distance_m = Math.round(Number(b.distance_m) || 0);
    if (!(duration_s >= 60)) throw bad('Registre ao menos 1 minuto de atividade');
    if (duration_s > 6 * 3600) throw bad('Duração acima de 6 horas. Confira o tempo.');
    if (distance_m < 0 || distance_m > 200_000) throw bad('Distância inválida');
    if (distance_m > 0 && distance_m / 1000 / (duration_s / 3600) > (b.kind === 'bike' ? 70 : 30)) throw bad('Velocidade média fora do possível. Confira distância e tempo.');
    const kcal = kcalFor({ kind: b.kind, distance_m, duration_s, weight_kg: req.member.weight_kg });
    const pace = distance_m > 0 ? Math.round(duration_s / (distance_m / 1000)) : null;
    let route = null;
    if (mode === 'gps' && Array.isArray(b.route)) {
      // guarda só o traçado (lat, lng arredondados), sem timestamps: suficiente para desenhar o mapa
      route = JSON.stringify(b.route.slice(0, 3000).map((p) => [Number(p[0].toFixed(5)), Number(p[1].toFixed(5))]));
    }
    const id = run(
      'INSERT INTO cardio_sessions (member_id, kind, mode, distance_m, duration_s, kcal, avg_pace_s_km, elevation_m, route, started_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      req.member.id,
      b.kind,
      mode,
      distance_m,
      duration_s,
      kcal,
      pace,
      Number.isFinite(Number(b.elevation_m)) ? Math.round(Number(b.elevation_m)) : null,
      route,
      b.started_at && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(b.started_at) ? b.started_at : now(),
      now()
    ).lastInsertRowid;
    const prevBest = one(`SELECT MAX(distance_m) AS d FROM cardio_sessions WHERE member_id = ? AND kind = ? AND id != ?`, req.member.id, b.kind, id)?.d || 0;
    return { id, kcal, avg_pace_s_km: pace, record: distance_m > prevBest && distance_m > 0 };
  })
);

r.get(
  '/cardio/:id',
  h((req) => {
    const s = one('SELECT * FROM cardio_sessions WHERE id = ? AND member_id = ?', req.params.id, req.member.id);
    if (!s) throw notFound('Atividade');
    return { ...s, route: s.route ? JSON.parse(s.route) : null };
  })
);

// ---------- Compartilhamento ----------
r.get(
  '/share-context',
  h((req) => {
    const month = today().slice(0, 7);
    return {
      gym: { name: req.gym.name, instagram: req.gym.instagram },
      member: { name: req.member.name, instagram: req.member.instagram },
      app_handle: process.env.FM_INSTAGRAM || 'fitmanager.app',
      month_visits: one(`SELECT COUNT(DISTINCT substr(created_at,1,10)) AS n FROM access_logs WHERE member_id = ? AND granted = 1 AND direction='entrada' AND created_at >= ?`, req.member.id, `${month}-01`).n,
      shares_month: one('SELECT COUNT(*) AS n FROM shares WHERE member_id = ? AND created_at >= ?', req.member.id, `${month}-01`).n,
    };
  })
);
r.post(
  '/shares',
  h((req) => {
    const kind = ['treino', 'cardio', 'frequencia', 'recorde'].includes(req.body?.kind) ? req.body.kind : 'treino';
    run('INSERT INTO shares (member_id, gym_id, kind, ref_id, created_at) VALUES (?,?,?,?,?)', req.member.id, req.gym.id, kind, req.body?.ref_id || null, now());
    return { ok: true };
  })
);

// ---------- Pagamento online ----------
r.get(
  '/payment-options',
  h((req) => {
    const online = req.gym.pay_provider !== 'manual';
    const prof = one('SELECT card_brand, card_last4, autopay, provider FROM payment_profiles WHERE member_id = ?', req.member.id);
    const card = prof?.card_last4 && prof.provider === req.gym.pay_provider ? { brand: prof.card_brand, last4: prof.card_last4, autopay: !!prof.autopay } : null;
    return { online, test_mode: req.gym.pay_provider === 'simulado', methods: online ? ['pix', 'cartao', 'boleto'] : req.gym.pix_key ? ['pix_manual'] : [], card };
  })
);

r.post(
  '/invoices/:id/checkout',
  h((req) => checkout({ gym: req.gym, invoiceId: req.params.id, memberId: req.member.id, method: req.body?.method || 'pix', origin: 'app' }))
);

/** Polling do app enquanto o aluno paga o Pix. */
r.get(
  '/invoices/:id/status',
  h((req) => {
    const inv = one('SELECT * FROM invoices WHERE id = ? AND member_id = ?', req.params.id, req.member.id);
    if (!inv) throw notFound('Fatura');
    return { status: inv.status, paid_at: inv.paid_at, situation: situation(req.member, req.gym).key };
  })
);

r.post(
  '/card',
  h((req) => {
    const b = req.body || {};
    return saveCard({
      gym: req.gym,
      member: req.member,
      card: { holderName: b.holderName, number: b.number, expiryMonth: b.expiryMonth, expiryYear: b.expiryYear, ccv: b.ccv },
      holder: { postalCode: b.postalCode, addressNumber: b.addressNumber },
      autopay: !!b.autopay,
      remoteIp: req.ip,
    });
  })
);

r.put(
  '/card/autopay',
  h((req) => {
    const p = one('SELECT * FROM payment_profiles WHERE member_id = ?', req.member.id);
    if (!p?.card_token) throw bad('Cadastre um cartão primeiro');
    run('UPDATE payment_profiles SET autopay = ?, updated_at = ? WHERE member_id = ?', req.body?.enabled ? 1 : 0, now(), req.member.id);
    return { autopay: !!req.body?.enabled };
  })
);

r.delete(
  '/card',
  h((req) => {
    run('UPDATE payment_profiles SET card_token = NULL, card_brand = NULL, card_last4 = NULL, autopay = 0, updated_at = ? WHERE member_id = ?', now(), req.member.id);
    return { ok: true };
  })
);

r.post('/invoices/:id/pay-card', h((req) => payWithCard({ gym: req.gym, invoiceId: req.params.id, memberId: req.member.id, origin: 'app', remoteIp: req.ip })));

/** Só no modo de testes: o aluno simula o banco confirmando o Pix. */
r.post(
  '/charges/:id/simulate-paid',
  h((req) => {
    const c = one(
      'SELECT c.* FROM gateway_charges c JOIN invoices i ON i.id = c.invoice_id WHERE c.id = ? AND i.member_id = ?',
      req.params.id,
      req.member.id
    );
    if (!c) throw notFound('Cobrança');
    return simulatePaid(req.gym, c);
  })
);

export default r;
