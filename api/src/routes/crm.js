import { Router } from 'express';
import { one, all, run } from '../db.js';
import { h, bad, notFound, requireFields } from '../lib/http.js';
import { now, today, addDays, isValidDate } from '../lib/time.js';
import { onlyDigits } from '../lib/cpf.js';
import { allow } from '../middleware.js';
import { churnRisk } from '../domain/members.js';

const r = Router();
r.use(allow('dono', 'recepcao'));

export const STAGES = ['novo', 'contato', 'visita', 'experimental', 'negociacao', 'matriculado', 'perdido'];
const LOST_REASONS = ['preco', 'distancia', 'horario', 'concorrente', 'sem_retorno', 'desistiu', 'outro'];

const leadOut = (l) => ({
  ...l,
  events: all(
    `SELECT e.*, u.name AS user_name FROM lead_events e LEFT JOIN users u ON u.id = e.user_id WHERE lead_id = ? ORDER BY e.created_at DESC`,
    l.id
  ),
  overdue_contact: l.next_contact && l.next_contact < today() && !['matriculado', 'perdido'].includes(l.stage),
});

r.get(
  '/leads',
  h((req) => {
    const rows = all(
      `SELECT l.*, p.name AS plan_name, u.name AS owner_name FROM leads l LEFT JOIN plans p ON p.id = l.interest_plan_id
         LEFT JOIN users u ON u.id = l.owner_id
        WHERE l.gym_id = ? AND (l.stage NOT IN ('matriculado','perdido') OR l.updated_at >= ?)
        ORDER BY COALESCE(l.next_contact, '9999'), l.created_at DESC`,
      req.gym.id,
      addDays(today(), -30)
    );
    return rows.map((l) => ({ ...l, overdue_contact: l.next_contact && l.next_contact < today() && !['matriculado', 'perdido'].includes(l.stage) }));
  })
);

r.get(
  '/leads/:id',
  h((req) => {
    const l = one('SELECT * FROM leads WHERE id = ? AND gym_id = ?', req.params.id, req.gym.id);
    if (!l) throw notFound('Lead');
    return leadOut(l);
  })
);

r.post(
  '/leads',
  h((req) => {
    const b = req.body || {};
    requireFields(b, ['name', 'phone']);
    const phone = onlyDigits(b.phone);
    if (phone.length < 10) throw bad('Telefone com DDD');
    const dup = one(`SELECT id, name FROM leads WHERE gym_id = ? AND phone = ? AND stage NOT IN ('matriculado','perdido')`, req.gym.id, phone);
    if (dup) throw bad(`Já existe um lead aberto com este telefone (${dup.name})`, { leadId: dup.id });
    const id = run(
      `INSERT INTO leads (gym_id, name, phone, email, source, stage, interest_plan_id, next_contact, owner_id, created_at, updated_at)
       VALUES (?,?,?,?,?, 'novo', ?, ?, ?, ?, ?)`,
      req.gym.id,
      b.name.trim(),
      phone,
      b.email || null,
      b.source || 'balcao',
      b.interest_plan_id || null,
      b.next_contact || today(),
      req.user.id,
      now(),
      now()
    ).lastInsertRowid;
    run(`INSERT INTO lead_events (lead_id, user_id, kind, note, created_at) VALUES (?,?, 'criado', ?, ?)`, id, req.user.id, b.note || null, now());
    return leadOut(one('SELECT * FROM leads WHERE id = ?', id));
  })
);

/** Mover no funil. "Perdido" exige motivo; "matriculado" só via cadastro de aluno (garante contrato). */
r.post(
  '/leads/:id/stage',
  h((req) => {
    const l = one('SELECT * FROM leads WHERE id = ? AND gym_id = ?', req.params.id, req.gym.id);
    if (!l) throw notFound('Lead');
    const { stage, lost_reason, note, next_contact } = req.body || {};
    if (!STAGES.includes(stage)) throw bad('Etapa inválida');
    if (stage === 'matriculado') throw bad('Para matricular, use "Converter em aluno": o cadastro gera contrato e cobrança');
    if (l.stage === 'matriculado') throw bad('Lead já matriculado');
    if (stage === 'perdido' && !LOST_REASONS.includes(lost_reason)) throw bad('Informe o motivo da perda');
    if (next_contact && !isValidDate(next_contact)) throw bad('Data de retorno inválida');
    run(
      'UPDATE leads SET stage = ?, lost_reason = ?, next_contact = ?, updated_at = ? WHERE id = ?',
      stage,
      stage === 'perdido' ? lost_reason : null,
      stage === 'perdido' ? null : next_contact || l.next_contact,
      now(),
      l.id
    );
    run(`INSERT INTO lead_events (lead_id, user_id, kind, note, created_at) VALUES (?,?,?,?,?)`, l.id, req.user.id, stage, note || null, now());
    return leadOut(one('SELECT * FROM leads WHERE id = ?', l.id));
  })
);

r.post(
  '/leads/:id/notes',
  h((req) => {
    const l = one('SELECT * FROM leads WHERE id = ? AND gym_id = ?', req.params.id, req.gym.id);
    if (!l) throw notFound('Lead');
    requireFields(req.body, ['note']);
    const kind = ['ligacao', 'whatsapp', 'nota'].includes(req.body.kind) ? req.body.kind : 'nota';
    run(`INSERT INTO lead_events (lead_id, user_id, kind, note, created_at) VALUES (?,?,?,?,?)`, l.id, req.user.id, kind, req.body.note, now());
    if (req.body.next_contact && isValidDate(req.body.next_contact)) run('UPDATE leads SET next_contact = ? WHERE id = ?', req.body.next_contact, l.id);
    run('UPDATE leads SET updated_at = ? WHERE id = ?', now(), l.id);
    return leadOut(one('SELECT * FROM leads WHERE id = ?', l.id));
  })
);

/** Painel de retenção: quem está sumido, quem vence logo, aniversariantes, quem saiu. */
r.get(
  '/retention',
  h((req) => {
    const on = today();
    const risk = churnRisk(req.gym, 10);
    const renewals = all(
      `SELECT c.id AS contract_id, c.end_date, m.id, m.name, m.phone, p.name AS plan_name FROM contracts c
         JOIN members m ON m.id = c.member_id JOIN plans p ON p.id = c.plan_id
        WHERE c.gym_id = ? AND c.status = 'ativo' AND c.end_date BETWEEN ? AND ?
          AND NOT EXISTS (SELECT 1 FROM contracts c2 WHERE c2.member_id = c.member_id AND c2.start_date > c.end_date AND c2.status = 'ativo')
        ORDER BY c.end_date`,
      req.gym.id,
      on,
      addDays(on, 30)
    );
    const birthdays = all(
      `SELECT id, name, phone, birth_date FROM members WHERE gym_id = ? AND status = 'ativo' AND substr(birth_date, 6, 2) = ? ORDER BY substr(birth_date, 9, 2)`,
      req.gym.id,
      on.slice(5, 7)
    );
    const cancelled = all(
      `SELECT c.cancel_reason, COUNT(*) AS n FROM contracts c WHERE c.gym_id = ? AND c.status = 'cancelado' AND c.cancelled_at >= ? GROUP BY c.cancel_reason ORDER BY n DESC`,
      req.gym.id,
      addDays(on, -90)
    );
    const funnel = Object.fromEntries(STAGES.map((s) => [s, 0]));
    for (const row of all(`SELECT stage, COUNT(*) AS n FROM leads WHERE gym_id = ? AND created_at >= ? GROUP BY stage`, req.gym.id, addDays(on, -90))) funnel[row.stage] = row.n;
    return { risk, renewals, birthdays, cancelled, funnel };
  })
);

export default r;
