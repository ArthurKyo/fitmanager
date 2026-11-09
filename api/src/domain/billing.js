import { one, all, run, tx } from '../db.js';
import { today, now, addDays, addMonths, diffDays } from '../lib/time.js';
import { bad, notFound, forbidden } from '../lib/http.js';
import { randomToken } from '../lib/auth.js';

/**
 * Regras financeiras
 * - Multa por atraso de 2% (limite do CDC, art. 52 §1º) + juros de mora de 1% ao mês, pro rata dia.
 * - Status "vencido" é derivado: fatura pendente com vencimento anterior a hoje.
 * - Desconto na matrícula: recepção até 10%, dono sem limite.
 * - Trancamento: precisa estar em dia, mínimo de 7 dias, limitado ao saldo do plano;
 *   prorroga o fim do contrato e empurra os vencimentos seguintes pelo mesmo número de dias.
 * - Cancelamento com fidelidade antes do fim: multa = % do plano sobre as parcelas futuras.
 */
export const LATE_FINE_PCT = 2;
export const LATE_INTEREST_MONTH_PCT = 1;
export const RECEPTION_MAX_DISCOUNT = 10;
export const MIN_FREEZE_DAYS = 7;
export const PAY_METHODS = ['pix', 'cartao_credito', 'cartao_debito', 'dinheiro', 'boleto'];

export function charges(inv, on = today()) {
  if (inv.status !== 'pendente' || inv.due_date >= on) {
    return { daysLate: 0, fine: 0, interest: 0, total: inv.amount_cents };
  }
  const daysLate = diffDays(inv.due_date, on);
  const fine = Math.round((inv.amount_cents * LATE_FINE_PCT) / 100);
  const interest = Math.round((inv.amount_cents * LATE_INTEREST_MONTH_PCT * daysLate) / 3000);
  return { daysLate, fine, interest, total: inv.amount_cents + fine + interest };
}

export function invoiceView(inv, on = today()) {
  const c = charges(inv, on);
  const state = inv.status === 'pendente' && inv.due_date < on ? 'vencido' : inv.status;
  return { ...inv, state, days_late: c.daysLate, fine_cents: c.fine, interest_cents: c.interest, due_cents: c.total };
}

export function currentContract(memberId, on = today()) {
  return one(
    `SELECT c.*, p.name AS plan_name, p.fidelity, p.cancel_fine_pct, p.freeze_days, p.max_daily_entries,
            p.hour_start, p.hour_end, p.weekdays, p.months, p.upfront
       FROM contracts c JOIN plans p ON p.id = c.plan_id
      WHERE c.member_id = ? AND c.status = 'ativo' AND c.start_date <= ? AND c.end_date >= ?
      ORDER BY c.start_date DESC LIMIT 1`,
    memberId,
    on,
    on
  );
}

export const activeFreeze = (contractId, on = today()) =>
  one('SELECT * FROM freezes WHERE contract_id = ? AND start_date <= ? AND end_date >= ?', contractId, on, on);

export function oldestOverdue(memberId, on = today()) {
  return one(
    `SELECT * FROM invoices WHERE member_id = ? AND status = 'pendente' AND due_date < ? ORDER BY due_date LIMIT 1`,
    memberId,
    on
  );
}

function audit(gymId, userId, action, entity, entityId, detail) {
  run(
    'INSERT INTO audit_log (gym_id, user_id, action, entity, entity_id, detail, created_at) VALUES (?,?,?,?,?,?,?)',
    gymId,
    userId ?? null,
    action,
    entity,
    entityId,
    detail ? JSON.stringify(detail) : null,
    now()
  );
}

function insertInvoice(i) {
  return run(
    `INSERT INTO invoices (gym_id, member_id, contract_id, kind, description, amount_cents, due_date, status, txid, created_at)
     VALUES (?,?,?,?,?,?,?, 'pendente', ?, ?)`,
    i.gym_id,
    i.member_id,
    i.contract_id ?? null,
    i.kind,
    i.description,
    i.amount_cents,
    i.due_date,
    `FM${randomToken(9).replace(/[^A-Za-z0-9]/g, '')}`.slice(0, 25),
    i.created_at ?? now()
  ).lastInsertRowid;
}

export function createContract({ gymId, memberId, planId, startDate, dueDay, discountPct = 0, user, createdAt }) {
  const plan = one('SELECT * FROM plans WHERE id = ? AND gym_id = ?', planId, gymId);
  if (!plan) throw notFound('Plano');
  if (!plan.active) throw bad('Este plano não está mais à venda');
  const member = one('SELECT * FROM members WHERE id = ? AND gym_id = ?', memberId, gymId);
  if (!member) throw notFound('Aluno');
  if (member.status !== 'ativo') throw bad('Reative o cadastro do aluno antes de vender um plano');

  discountPct = Number(discountPct) || 0;
  if (discountPct < 0 || discountPct > 100) throw bad('Desconto deve estar entre 0% e 100%');
  if (user?.role === 'recepcao' && discountPct > RECEPTION_MAX_DISCOUNT)
    throw forbidden(`A recepção pode conceder até ${RECEPTION_MAX_DISCOUNT}% de desconto. Peça ao dono para aprovar.`);

  const start = startDate || today();
  if (start < addDays(today(), -1) && !createdAt) throw bad('A data de início não pode estar no passado');
  const day = Math.min(28, Math.max(1, Number(dueDay) || Number(start.slice(8, 10)) || 10));

  const overlap = one(
    `SELECT end_date FROM contracts WHERE member_id = ? AND status = 'ativo' AND end_date >= ? ORDER BY end_date DESC LIMIT 1`,
    memberId,
    start
  );
  if (overlap)
    throw bad(`O aluno já tem plano ativo até ${overlap.end_date.split('-').reverse().join('/')}. Use a renovação para emendar.`);

  const end = addDays(addMonths(start, plan.months), -1);
  const monthly = Math.round(plan.price_cents * (1 - discountPct / 100));
  const firstContract = !one('SELECT id FROM contracts WHERE member_id = ?', memberId);
  const stamp = createdAt || now();

  return tx(() => {
    const contractId = run(
      `INSERT INTO contracts (gym_id, member_id, plan_id, start_date, end_date, due_day, monthly_cents, status, created_at)
       VALUES (?,?,?,?,?,?,?, 'ativo', ?)`,
      gymId,
      memberId,
      planId,
      start,
      end,
      day,
      monthly,
      stamp
    ).lastInsertRowid;

    const base = { gym_id: gymId, member_id: memberId, contract_id: contractId, created_at: stamp };
    if (firstContract && plan.enrollment_fee_cents > 0) {
      insertInvoice({ ...base, kind: 'matricula', description: 'Taxa de matrícula', amount_cents: plan.enrollment_fee_cents, due_date: start });
    }
    if (plan.upfront) {
      insertInvoice({
        ...base,
        kind: 'mensalidade',
        description: `${plan.name}, pagamento único de ${plan.months} meses`,
        amount_cents: monthly * plan.months,
        due_date: start,
      });
    } else {
      for (let i = 0; i < plan.months; i++) {
        insertInvoice({
          ...base,
          kind: 'mensalidade',
          description: plan.months > 1 ? `${plan.name}, parcela ${i + 1} de ${plan.months}` : `${plan.name}, mensalidade`,
          amount_cents: monthly,
          due_date: i === 0 ? start : addMonths(start, i, day),
        });
      }
    }
    audit(gymId, user?.id, 'contrato.criar', 'contract', contractId, { planId, discountPct });
    return one('SELECT * FROM contracts WHERE id = ?', contractId);
  });
}

export function renewContract({ gymId, contractId, planId, user }) {
  const c = one('SELECT * FROM contracts WHERE id = ? AND gym_id = ?', contractId, gymId);
  if (!c) throw notFound('Contrato');
  if (c.status === 'cancelado') throw bad('Contrato cancelado não pode ser renovado; faça uma nova matrícula');
  const start = c.end_date < today() ? today() : addDays(c.end_date, 1);
  if (c.end_date < today()) run(`UPDATE contracts SET status='encerrado' WHERE id = ?`, c.id);
  return createContract({ gymId, memberId: c.member_id, planId: planId || c.plan_id, startDate: start, dueDay: c.due_day, user });
}

export function freezeContract({ gymId, contractId, startDate, days, reason, user }) {
  const c = one(
    `SELECT c.*, p.freeze_days FROM contracts c JOIN plans p ON p.id = c.plan_id WHERE c.id = ? AND c.gym_id = ?`,
    contractId,
    gymId
  );
  if (!c) throw notFound('Contrato');
  if (c.status !== 'ativo') throw bad('Só é possível trancar contrato ativo');
  days = Number(days);
  const start = startDate || today();
  if (!Number.isInteger(days) || days < MIN_FREEZE_DAYS) throw bad(`O trancamento mínimo é de ${MIN_FREEZE_DAYS} dias`);
  if (c.freeze_days === 0) throw bad('Este plano não permite trancamento');
  const left = c.freeze_days - c.freeze_used_days;
  if (days > left) throw bad(`Saldo de trancamento: ${left} dias`);
  if (start < today()) throw bad('O trancamento não pode começar no passado');
  if (start > c.end_date) throw bad('O trancamento precisa começar antes do fim do contrato');
  if (oldestOverdue(c.member_id)) throw bad('Regularize as mensalidades vencidas antes de trancar');
  const end = addDays(start, days - 1);
  const clash = one(
    'SELECT id FROM freezes WHERE contract_id = ? AND NOT (end_date < ? OR start_date > ?)',
    contractId,
    start,
    end
  );
  if (clash) throw bad('Já existe trancamento neste período');

  return tx(() => {
    run('INSERT INTO freezes (contract_id, start_date, end_date, reason, created_at) VALUES (?,?,?,?,?)', contractId, start, end, reason || null, now());
    run('UPDATE contracts SET end_date = ?, freeze_used_days = freeze_used_days + ? WHERE id = ?', addDays(c.end_date, days), days, contractId);
    const pend = all(`SELECT id, due_date FROM invoices WHERE contract_id = ? AND status = 'pendente' AND due_date >= ?`, contractId, start);
    for (const i of pend) run('UPDATE invoices SET due_date = ? WHERE id = ?', addDays(i.due_date, days), i.id);
    audit(gymId, user?.id, 'contrato.trancar', 'contract', contractId, { start, days, reason });
    return { start, end, days, shiftedInvoices: pend.length, newEndDate: addDays(c.end_date, days) };
  });
}

export function cancelPreview(gymId, contractId, on = today()) {
  const c = one(
    `SELECT c.*, p.fidelity, p.cancel_fine_pct, p.name AS plan_name FROM contracts c JOIN plans p ON p.id = c.plan_id
      WHERE c.id = ? AND c.gym_id = ?`,
    contractId,
    gymId
  );
  if (!c) throw notFound('Contrato');
  const future = all(`SELECT * FROM invoices WHERE contract_id = ? AND status = 'pendente' AND due_date > ?`, contractId, on);
  const remaining = future.reduce((s, i) => s + i.amount_cents, 0);
  const fine = c.fidelity && on < c.end_date ? Math.round((remaining * c.cancel_fine_pct) / 100) : 0;
  const openDebt = all(`SELECT * FROM invoices WHERE contract_id = ? AND status = 'pendente' AND due_date <= ?`, contractId, on);
  return {
    contract: c,
    futureInvoices: future.length,
    remainingCents: remaining,
    fineCents: fine,
    finePct: c.fidelity ? c.cancel_fine_pct : 0,
    openDebtCents: openDebt.reduce((s, i) => s + charges(i, on).total, 0),
  };
}

export function cancelContract({ gymId, contractId, reason, user }) {
  if (!reason || String(reason).trim().length < 3) throw bad('Informe o motivo do cancelamento (usado no relatório de evasão)');
  const p = cancelPreview(gymId, contractId);
  if (p.contract.status !== 'ativo') throw bad('Contrato já está encerrado ou cancelado');
  const on = today();
  return tx(() => {
    run(`UPDATE invoices SET status = 'cancelado' WHERE contract_id = ? AND status = 'pendente' AND due_date > ?`, contractId, on);
    run(
      `UPDATE contracts SET status = 'cancelado', cancelled_at = ?, cancel_reason = ?, end_date = ? WHERE id = ?`,
      now(),
      reason,
      on < p.contract.end_date ? on : p.contract.end_date,
      contractId
    );
    run('DELETE FROM freezes WHERE contract_id = ? AND start_date > ?', contractId, on);
    let fineInvoiceId = null;
    if (p.fineCents > 0) {
      fineInvoiceId = insertInvoice({
        gym_id: gymId,
        member_id: p.contract.member_id,
        contract_id: contractId,
        kind: 'multa',
        description: `Multa rescisória de ${p.finePct}%, ${p.contract.plan_name}`,
        amount_cents: p.fineCents,
        due_date: addDays(on, 5),
      });
    }
    audit(gymId, user?.id, 'contrato.cancelar', 'contract', contractId, { reason, fine: p.fineCents });
    return { ...p, fineInvoiceId };
  });
}

export function payInvoice({ gymId, invoiceId, method, user, paidAt, paidCents }) {
  if (!PAY_METHODS.includes(method)) throw bad(`Forma de pagamento inválida. Use: ${PAY_METHODS.join(', ')}`);
  const inv = one('SELECT * FROM invoices WHERE id = ? AND gym_id = ?', invoiceId, gymId);
  if (!inv) throw notFound('Fatura');
  if (inv.status === 'pago') throw bad('Esta fatura já foi paga');
  if (inv.status === 'cancelado') throw bad('Fatura cancelada não pode ser recebida');
  const at = paidAt || now();
  const total = paidCents ?? charges(inv, at.slice(0, 10)).total; // gateway informa o valor efetivamente pago
  run(
    `UPDATE invoices SET status = 'pago', paid_at = ?, paid_cents = ?, method = ?, received_by = ? WHERE id = ?`,
    at,
    total,
    method,
    user?.id ?? null,
    invoiceId
  );
  audit(gymId, user?.id, 'fatura.receber', 'invoice', invoiceId, { method, total });
  return invoiceView(one('SELECT * FROM invoices WHERE id = ?', invoiceId));
}

export function createAvulsa({ gymId, memberId, description, amountCents, dueDate, user }) {
  if (!one('SELECT id FROM members WHERE id = ? AND gym_id = ?', memberId, gymId)) throw notFound('Aluno');
  if (!(amountCents > 0)) throw bad('Valor deve ser maior que zero');
  const id = insertInvoice({ gym_id: gymId, member_id: memberId, kind: 'avulso', description, amount_cents: amountCents, due_date: dueDate || today() });
  audit(gymId, user?.id, 'fatura.avulsa', 'invoice', id, { amountCents });
  return one('SELECT * FROM invoices WHERE id = ?', id);
}

/** Encerra contratos cujo período terminou. Roda na subida e de hora em hora. */
export function closeExpiredContracts() {
  return run(`UPDATE contracts SET status = 'encerrado' WHERE status = 'ativo' AND end_date < ?`, today()).changes;
}
