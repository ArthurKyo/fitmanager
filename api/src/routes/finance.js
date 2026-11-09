import { Router } from 'express';
import { one, all, run } from '../db.js';
import { h, bad, notFound, requireFields, int } from '../lib/http.js';
import { today, now, addMonths, addDays } from '../lib/time.js';
import { brCode } from '../lib/pix.js';
import { allow } from '../middleware.js';
import {
  createContract,
  renewContract,
  freezeContract,
  cancelPreview,
  cancelContract,
  payInvoice,
  createAvulsa,
  invoiceView,
} from '../domain/billing.js';
import { cancelOpenCharges } from '../payments/service.js';

export const plans = Router();
export const contracts = Router();
export const invoices = Router();

// ---------- Planos ----------
const planFields = ['name', 'months', 'price_cents', 'upfront', 'enrollment_fee_cents', 'fidelity', 'cancel_fine_pct', 'max_daily_entries', 'hour_start', 'hour_end', 'weekdays', 'freeze_days', 'active'];

function validatePlan(p) {
  requireFields(p, ['name', 'months', 'price_cents']);
  const n = (k) => Number(p[k]);
  if (!Number.isInteger(n('months')) || n('months') < 1 || n('months') > 24) throw bad('Duração entre 1 e 24 meses');
  if (!(n('price_cents') >= 0)) throw bad('Preço inválido');
  if (n('hour_start') >= n('hour_end')) throw bad('Horário inicial precisa ser antes do final');
  if (n('cancel_fine_pct') < 0 || n('cancel_fine_pct') > 50) throw bad('Multa rescisória entre 0% e 50%');
  if (!/^[0-6]{1,7}$/.test(p.weekdays)) throw bad('Selecione ao menos um dia da semana');
  if (p.fidelity && n('months') < 3) throw bad('Fidelidade só faz sentido em planos de 3 meses ou mais');
}

const planDefaults = { upfront: 0, enrollment_fee_cents: 0, fidelity: 0, cancel_fine_pct: 0, max_daily_entries: 2, hour_start: 0, hour_end: 24, weekdays: '0123456', freeze_days: 0, active: 1 };

plans.get(
  '/',
  h((req) => {
    const rows = all('SELECT * FROM plans WHERE gym_id = ? ORDER BY active DESC, months, price_cents', req.gym.id);
    for (const p of rows)
      p.active_contracts = one(`SELECT COUNT(*) AS n FROM contracts WHERE plan_id = ? AND status = 'ativo' AND end_date >= ?`, p.id, today()).n;
    return rows;
  })
);

plans.post(
  '/',
  allow('dono'),
  h((req) => {
    const p = { ...planDefaults, ...req.body };
    validatePlan(p);
    const vals = planFields.map((f) => (typeof p[f] === 'boolean' ? Number(p[f]) : p[f]));
    const id = run(`INSERT INTO plans (gym_id, ${planFields.join(',')}) VALUES (?, ${planFields.map(() => '?').join(',')})`, req.gym.id, ...vals).lastInsertRowid;
    return one('SELECT * FROM plans WHERE id = ?', id);
  })
);

/** Alterar preço não mexe em contratos já vendidos — o valor fica congelado no contrato. */
plans.put(
  '/:id',
  allow('dono'),
  h((req) => {
    const cur = one('SELECT * FROM plans WHERE id = ? AND gym_id = ?', req.params.id, req.gym.id);
    if (!cur) throw notFound('Plano');
    const p = { ...cur, ...req.body };
    validatePlan(p);
    const vals = planFields.map((f) => (typeof p[f] === 'boolean' ? Number(p[f]) : p[f]));
    run(`UPDATE plans SET ${planFields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, ...vals, cur.id);
    return one('SELECT * FROM plans WHERE id = ?', cur.id);
  })
);

// ---------- Contratos ----------
contracts.post(
  '/',
  allow('dono', 'recepcao'),
  h((req) => {
    requireFields(req.body, ['member_id', 'plan_id']);
    return createContract({
      gymId: req.gym.id,
      memberId: req.body.member_id,
      planId: req.body.plan_id,
      startDate: req.body.start_date,
      dueDay: req.body.due_day,
      discountPct: req.body.discount_pct,
      user: req.user,
    });
  })
);

contracts.post(
  '/:id/renew',
  allow('dono', 'recepcao'),
  h((req) => renewContract({ gymId: req.gym.id, contractId: req.params.id, planId: req.body?.plan_id, user: req.user }))
);

contracts.post(
  '/:id/freeze',
  allow('dono', 'recepcao'),
  h((req) =>
    freezeContract({ gymId: req.gym.id, contractId: req.params.id, startDate: req.body?.start_date, days: req.body?.days, reason: req.body?.reason, user: req.user })
  )
);

contracts.get('/:id/cancel-preview', allow('dono', 'recepcao'), h((req) => cancelPreview(req.gym.id, req.params.id)));

contracts.post(
  '/:id/cancel',
  allow('dono', 'recepcao'),
  h((req) => cancelContract({ gymId: req.gym.id, contractId: req.params.id, reason: req.body?.reason, user: req.user }))
);

// ---------- Faturas ----------
invoices.get(
  '/',
  allow('dono', 'recepcao'),
  h((req) => {
    const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : today().slice(0, 7);
    const from = `${month}-01`;
    const to = addDays(addMonths(from, 1), -1);
    const state = req.query.state || '';
    const q = String(req.query.q || '').trim();
    let rows;
    if (state === 'vencido') {
      // inadimplência é olhada no acumulado, não no mês
      rows = all(
        `SELECT i.*, m.name AS member_name, m.phone FROM invoices i JOIN members m ON m.id = i.member_id
          WHERE i.gym_id = ? AND i.status = 'pendente' AND i.due_date < ? ORDER BY i.due_date`,
        req.gym.id,
        today()
      );
    } else {
      rows = all(
        `SELECT i.*, m.name AS member_name, m.phone FROM invoices i JOIN members m ON m.id = i.member_id
          WHERE i.gym_id = ? AND ((i.due_date BETWEEN ? AND ?) OR (substr(i.paid_at,1,10) BETWEEN ? AND ?))
          ORDER BY i.due_date, m.name`,
        req.gym.id,
        from,
        to,
        from,
        to
      );
    }
    let items = rows.map((i) => invoiceView(i));
    if (q) items = items.filter((i) => i.member_name.toLowerCase().includes(q.toLowerCase()));
    if (state && state !== 'vencido') items = items.filter((i) => i.state === state);
    const inMonth = items.filter((i) => i.due_date >= from && i.due_date <= to);
    const totals = {
      expected_cents: inMonth.filter((i) => i.status !== 'cancelado').reduce((s, i) => s + i.amount_cents, 0),
      received_cents: items.filter((i) => i.paid_at && i.paid_at.slice(0, 10) >= from && i.paid_at.slice(0, 10) <= to).reduce((s, i) => s + i.paid_cents, 0),
      open_cents: inMonth.filter((i) => i.state === 'pendente').reduce((s, i) => s + i.amount_cents, 0),
      overdue_cents: inMonth.filter((i) => i.state === 'vencido').reduce((s, i) => s + i.due_cents, 0),
    };
    return { month, totals, items };
  })
);

invoices.post(
  '/',
  allow('dono', 'recepcao'),
  h((req) => {
    requireFields(req.body, ['member_id', 'description', 'amount_cents']);
    return createAvulsa({
      gymId: req.gym.id,
      memberId: req.body.member_id,
      description: req.body.description,
      amountCents: int(req.body.amount_cents, 0),
      dueDate: req.body.due_date,
      user: req.user,
    });
  })
);

invoices.post(
  '/:id/pay',
  allow('dono', 'recepcao'),
  h(async (req) => {
    const r = payInvoice({ gymId: req.gym.id, invoiceId: req.params.id, method: req.body?.method, user: req.user });
    await cancelOpenCharges(req.gym, r.id); // recebeu no balcão: derruba Pix/boleto online abertos
    return r;
  })
);

/** Estorno/cancelamento de cobrança só pelo dono. */
invoices.post(
  '/:id/cancel',
  allow('dono'),
  h((req) => {
    const inv = one('SELECT * FROM invoices WHERE id = ? AND gym_id = ?', req.params.id, req.gym.id);
    if (!inv) throw notFound('Fatura');
    if (inv.status !== 'pendente') throw bad('Só faturas em aberto podem ser canceladas');
    run(`UPDATE invoices SET status = 'cancelado' WHERE id = ?`, inv.id);
    run(
      'INSERT INTO audit_log (gym_id, user_id, action, entity, entity_id, detail, created_at) VALUES (?,?,?,?,?,?,?)',
      req.gym.id,
      req.user.id,
      'fatura.cancelar',
      'invoice',
      inv.id,
      JSON.stringify({ reason: req.body?.reason || null }),
      now()
    );
    return { ok: true };
  })
);

export function pixFor(gym, inv) {
  const v = invoiceView(inv);
  return {
    invoice: v,
    amount_cents: v.due_cents,
    payload: brCode({ key: gym.pix_key, merchant: gym.pix_merchant || gym.name, city: gym.pix_city, amountCents: v.due_cents, txid: inv.txid }),
  };
}

invoices.get(
  '/:id/pix',
  allow('dono', 'recepcao'),
  h((req) => {
    const inv = one('SELECT * FROM invoices WHERE id = ? AND gym_id = ?', req.params.id, req.gym.id);
    if (!inv) throw notFound('Fatura');
    if (inv.status !== 'pendente') throw bad('Fatura não está em aberto');
    if (!req.gym.pix_key) throw bad('Cadastre a chave Pix da academia em Configurações');
    return pixFor(req.gym, inv);
  })
);
