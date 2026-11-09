import { Router } from 'express';
import { one, all, run } from '../db.js';
import { h, bad, requireFields, notFound } from '../lib/http.js';
import { today, now, addDays, addMonths } from '../lib/time.js';
import { hashPassword, randomToken } from '../lib/auth.js';
import { allow, STAFF } from '../middleware.js';
import { hourlyProfile, hourlyBaseline, insideNow, CODES } from '../domain/access.js';
import { memberSummary } from '../domain/members.js';
import { charges } from '../domain/billing.js';

export const dashboard = Router();
export const settings = Router();

dashboard.get(
  '/overview',
  allow(...STAFF),
  h((req) => {
    const g = req.gym;
    const on = today();
    const month = on.slice(0, 7);
    const dayRange = [`${on} 00:00:00`, `${on} 23:59:59`];

    const entries = one(`SELECT COUNT(*) AS n, COUNT(DISTINCT member_id) AS u FROM access_logs WHERE gym_id = ? AND granted = 1 AND direction='entrada' AND created_at BETWEEN ? AND ?`, g.id, ...dayRange);
    const denials = all(
      `SELECT code, COUNT(*) AS n FROM access_logs WHERE gym_id = ? AND granted = 0 AND created_at BETWEEN ? AND ? GROUP BY code ORDER BY n DESC`,
      g.id,
      ...dayRange
    ).map((d) => ({ ...d, label: CODES[d.code] }));
    const byMethod = all(
      `SELECT method, COUNT(*) AS n FROM access_logs WHERE gym_id = ? AND granted = 1 AND direction='entrada' AND created_at BETWEEN ? AND ? GROUP BY method`,
      g.id,
      ...dayRange
    );
    const hourly = hourlyProfile(g.id, on);
    const baseline = hourlyBaseline(g.id, on);

    const daily = [];
    for (let i = 29; i >= 0; i--) {
      const d = addDays(on, -i);
      daily.push({
        date: d,
        n: one(`SELECT COUNT(DISTINCT member_id) AS n FROM access_logs WHERE gym_id = ? AND granted = 1 AND direction='entrada' AND created_at BETWEEN ? AND ?`, g.id, `${d} 00:00:00`, `${d} 23:59:59`).n,
      });
    }

    const members = all(`SELECT * FROM members WHERE gym_id = ? AND status = 'ativo'`, g.id).map((m) => memberSummary(m, g));
    const sit = members.reduce((a, m) => ((a[m.situation] = (a[m.situation] || 0) + 1), a), {});
    const withPlan = members.filter((m) => !['sem_plano', 'inativo'].includes(m.situation)).length;

    const mrr = one(
      `SELECT COALESCE(SUM(monthly_cents),0) AS v FROM contracts WHERE gym_id = ? AND status = 'ativo' AND start_date <= ? AND end_date >= ?`,
      g.id,
      on,
      on
    ).v;
    const received = one(`SELECT COALESCE(SUM(paid_cents),0) AS v FROM invoices WHERE gym_id = ? AND status='pago' AND substr(paid_at,1,7) = ?`, g.id, month).v;
    const expected = one(`SELECT COALESCE(SUM(amount_cents),0) AS v FROM invoices WHERE gym_id = ? AND status != 'cancelado' AND substr(due_date,1,7) = ?`, g.id, month).v;
    const overdueRows = all(`SELECT * FROM invoices WHERE gym_id = ? AND status='pendente' AND due_date < ?`, g.id, on);
    const newMembers = one(`SELECT COUNT(*) AS n FROM contracts c WHERE gym_id = ? AND substr(created_at,1,7) = ? AND NOT EXISTS (SELECT 1 FROM contracts c2 WHERE c2.member_id = c.member_id AND c2.id < c.id)`, g.id, month).n;
    const cancels = one(`SELECT COUNT(*) AS n FROM contracts WHERE gym_id = ? AND status = 'cancelado' AND substr(cancelled_at,1,7) = ?`, g.id, month).n;
    const leadsOpen = one(`SELECT COUNT(*) AS n FROM leads WHERE gym_id = ? AND stage NOT IN ('matriculado','perdido')`, g.id).n;
    const leadsLate = one(`SELECT COUNT(*) AS n FROM leads WHERE gym_id = ? AND stage NOT IN ('matriculado','perdido') AND next_contact < ?`, g.id, on).n;

    const recent = all(
      `SELECT a.*, m.name AS member_name, d.name AS device_name FROM access_logs a LEFT JOIN members m ON m.id = a.member_id LEFT JOIN devices d ON d.id = a.device_id
        WHERE a.gym_id = ? ORDER BY a.created_at DESC LIMIT 30`,
      g.id
    ).map((a) => ({ ...a, granted: !!a.granted, label: CODES[a.code] }));

    const showMoney = req.user.role === 'dono';
    return {
      gym: { name: g.name, max_capacity: g.max_capacity, open_hour: g.open_hour, close_hour: g.close_hour },
      today: { date: on, entries: entries.n, unique: entries.u, inside: insideNow(g), denials, byMethod, hourly, baseline },
      daily,
      recent,
      members: { active: withPlan, situation: sit, new_month: newMembers, cancels_month: cancels },
      leads: { open: leadsOpen, late: leadsLate },
      finance: showMoney
        ? {
            mrr_cents: mrr,
            received_cents: received,
            expected_cents: expected,
            overdue_cents: overdueRows.reduce((s, i) => s + charges(i, on).total, 0),
            overdue_count: overdueRows.length,
            overdue_members: new Set(overdueRows.map((i) => i.member_id)).size,
          }
        : null,
    };
  })
);

dashboard.get(
  '/reports',
  allow('dono'),
  h((req) => {
    const g = req.gym;
    const on = today();
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const m = addMonths(`${on.slice(0, 7)}-01`, -i).slice(0, 7);
      const rec = one(`SELECT COALESCE(SUM(paid_cents),0) AS v FROM invoices WHERE gym_id = ? AND status='pago' AND substr(paid_at,1,7) = ?`, g.id, m).v;
      const exp = one(`SELECT COALESCE(SUM(amount_cents),0) AS v FROM invoices WHERE gym_id = ? AND status != 'cancelado' AND substr(due_date,1,7) = ?`, g.id, m).v;
      const lateCount = one(
        `SELECT COUNT(*) AS n FROM invoices WHERE gym_id = ? AND substr(due_date,1,7) = ? AND status != 'cancelado' AND (status = 'pendente' AND due_date < ? OR (status='pago' AND substr(paid_at,1,10) > due_date))`,
        g.id,
        m,
        on
      ).n;
      const total = one(`SELECT COUNT(*) AS n FROM invoices WHERE gym_id = ? AND substr(due_date,1,7) = ? AND status != 'cancelado' AND due_date < ?`, g.id, m, on).n;
      months.push({ month: m, received_cents: rec, expected_cents: exp, late_rate: total ? lateCount / total : 0 });
    }
    const methods = all(
      `SELECT method, COUNT(*) AS n, SUM(paid_cents) AS v FROM invoices WHERE gym_id = ? AND status='pago' AND substr(paid_at,1,7) = ? GROUP BY method ORDER BY v DESC`,
      g.id,
      on.slice(0, 7)
    );
    const weekday = all(
      `SELECT CAST(strftime('%w', created_at) AS INTEGER) AS wd, COUNT(*) * 1.0 / 4 AS avg FROM access_logs
        WHERE gym_id = ? AND granted = 1 AND direction='entrada' AND created_at >= ? AND created_at < ? GROUP BY wd`,
      g.id,
      addDays(on, -28),
      on
    );
    const plans = all(
      `SELECT p.name, COUNT(c.id) AS n, COALESCE(SUM(c.monthly_cents),0) AS mrr FROM plans p LEFT JOIN contracts c ON c.plan_id = p.id AND c.status='ativo' AND c.end_date >= ?
        WHERE p.gym_id = ? GROUP BY p.id ORDER BY mrr DESC`,
      on,
      g.id
    );
    const churnReasons = all(
      `SELECT cancel_reason AS reason, COUNT(*) AS n FROM contracts WHERE gym_id = ? AND status='cancelado' AND cancelled_at >= ? GROUP BY cancel_reason ORDER BY n DESC`,
      g.id,
      addDays(on, -180)
    );
    return { months, methods, weekday, plans, churnReasons };
  })
);

// ---------- Configurações da academia e equipe ----------
settings.use(allow('dono'));

const GYM_FIELDS = ['name', 'cnpj', 'phone', 'address', 'instagram', 'pix_key', 'pix_merchant', 'pix_city', 'overdue_tolerance_days', 'require_medical', 'max_capacity', 'antipassback_minutes', 'open_hour', 'close_hour'];

settings.get('/gym', h((req) => req.gym));

settings.put(
  '/gym',
  h((req) => {
    const g = { ...req.gym, ...req.body };
    if (g.overdue_tolerance_days < 0 || g.overdue_tolerance_days > 30) throw bad('Tolerância entre 0 e 30 dias');
    if (g.open_hour >= g.close_hour) throw bad('Horário de abertura precisa ser antes do fechamento');
    if (g.max_capacity < 0) throw bad('Lotação inválida');
    const vals = GYM_FIELDS.map((f) => (typeof g[f] === 'boolean' ? Number(g[f]) : g[f]));
    run(`UPDATE gyms SET ${GYM_FIELDS.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, ...vals, req.gym.id);
    return one('SELECT * FROM gyms WHERE id = ?', req.gym.id);
  })
);

settings.get('/staff', h((req) => all(`SELECT id, name, email, role, active, created_at FROM users WHERE gym_id = ? AND role != 'aluno' ORDER BY role, name`, req.gym.id)));

settings.post(
  '/staff',
  h((req) => {
    const b = req.body || {};
    requireFields(b, ['name', 'email', 'role']);
    if (!['dono', 'recepcao', 'professor'].includes(b.role)) throw bad('Perfil inválido');
    const email = b.email.trim().toLowerCase();
    if (one('SELECT id FROM users WHERE email = ?', email)) throw bad('E-mail já cadastrado');
    const temp = `fm-${randomToken(5).replace(/[^A-Za-z0-9]/g, 'x').slice(0, 8)}`;
    run(`INSERT INTO users (gym_id, name, email, password_hash, role, created_at) VALUES (?,?,?,?,?,?)`, req.gym.id, b.name, email, hashPassword(temp), b.role, now());
    return { email, temporaryPassword: temp };
  })
);

settings.put(
  '/staff/:id',
  h((req) => {
    const u = one(`SELECT * FROM users WHERE id = ? AND gym_id = ? AND role != 'aluno'`, req.params.id, req.gym.id);
    if (!u) throw notFound('Usuário');
    if (u.id === req.user.id && req.body.active === false) throw bad('Você não pode desativar o próprio acesso');
    const role = req.body.role ?? u.role;
    if (!['dono', 'recepcao', 'professor'].includes(role)) throw bad('Perfil inválido');
    if (u.role === 'dono' && role !== 'dono') {
      const owners = one(`SELECT COUNT(*) AS n FROM users WHERE gym_id = ? AND role = 'dono' AND active = 1`, req.gym.id).n;
      if (owners <= 1) throw bad('A academia precisa de pelo menos um dono ativo');
    }
    run('UPDATE users SET role = ?, active = ? WHERE id = ?', role, req.body.active === undefined ? u.active : req.body.active ? 1 : 0, u.id);
    return { ok: true };
  })
);

settings.get(
  '/audit',
  h((req) =>
    all(
      `SELECT a.*, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id WHERE a.gym_id = ? ORDER BY a.created_at DESC LIMIT 200`,
      req.gym.id
    )
  )
);
