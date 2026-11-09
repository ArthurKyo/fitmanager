// Testes das regras de negócio contra um banco em memória.
process.env.FM_DB = ':memory:';
process.env.FM_SECRET = 'test-secret';

import test from 'node:test';
import assert from 'node:assert/strict';

const { run, one, all } = await import('../src/db.js');
const { isValidCPF, fakeCPF } = await import('../src/lib/cpf.js');
const { crc16, brCode } = await import('../src/lib/pix.js');
const { addMonths, addDays, today, age } = await import('../src/lib/time.js');
const { accessQR, readAccessQR } = await import('../src/lib/auth.js');
const billing = await import('../src/domain/billing.js');
const { evaluateAccess } = await import('../src/domain/access.js');

test('CPF: dígitos verificadores', () => {
  assert.equal(isValidCPF('529.982.247-25'), true);
  assert.equal(isValidCPF('529.982.247-24'), false);
  assert.equal(isValidCPF('111.111.111-11'), false);
  for (let i = 0; i < 50; i++) assert.equal(isValidCPF(fakeCPF()), true);
});

test('Pix: CRC16-CCITT e estrutura do BR Code', () => {
  assert.equal(crc16('123456789'), '29B1'); // valor de verificação padrão do CRC-16/CCITT-FALSE
  const code = brCode({ key: 'pix@academia.com', merchant: 'Academia Ção', city: 'São Paulo', amountCents: 15990, txid: 'FM123' });
  assert.match(code, /^000201010212/);
  assert.ok(code.includes('5406159.90'));
  assert.ok(code.includes('ACADEMIA CAO'));
  assert.equal(code.slice(-4), crc16(code.slice(0, -4)));
});

test('Datas: soma de meses respeita fim de mês', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2026-11-08', 3, 10), '2027-02-10');
  assert.equal(age('2000-11-09', '2026-11-08'), 25);
});

test('QR do app: válido por ~60 s e não forjável', () => {
  const t = Date.now();
  const { code } = accessQR(7, t);
  assert.deepEqual(readAccessQR(code, t), { memberId: 7, expired: false });
  assert.equal(readAccessQR(code, t + 5 * 60_000).expired, true);
  assert.equal(readAccessQR(code.replace('FM1.7.', 'FM1.8.'), t), null);
});

test('Multa 2% + juros 1% a.m. pro rata', () => {
  const inv = { status: 'pendente', due_date: addDays(today(), -30), amount_cents: 10000 };
  const c = billing.charges(inv);
  assert.equal(c.fine, 200);
  assert.equal(c.interest, 100);
  assert.equal(c.total, 10300);
  assert.equal(billing.charges({ ...inv, due_date: today() }).total, 10000);
});

// ---------- cenário integrado ----------
const gymId = run(`INSERT INTO gyms (name, slug, pix_key, created_at, open_hour, close_hour, antipassback_minutes, max_capacity) VALUES ('G','g','k','2026-01-01', 0, 24, 240, 0)`).lastInsertRowid;
const gym = () => one('SELECT * FROM gyms WHERE id = ?', gymId);
const planId = run(`INSERT INTO plans (gym_id, name, months, price_cents, fidelity, cancel_fine_pct, freeze_days, max_daily_entries) VALUES (?, 'Anual', 12, 10000, 1, 30, 30, 2)`, gymId).lastInsertRowid;
const diurno = run(`INSERT INTO plans (gym_id, name, months, price_cents, hour_start, hour_end, weekdays) VALUES (?, 'Diurno', 1, 8000, 6, 16, '12345')`, gymId).lastInsertRowid;
const mk = (name) =>
  run(`INSERT INTO members (gym_id, name, cpf, birth_date, medical_valid_until, created_at) VALUES (?,?,?,?,?,?)`, gymId, name, fakeCPF(), '1990-05-05', addDays(today(), 200), today()).lastInsertRowid;

test('Contrato anual gera 12 parcelas e bloqueia sobreposição', () => {
  const m = mk('Ana');
  const c = billing.createContract({ gymId, memberId: m, planId, dueDay: 10 });
  const inv = all('SELECT * FROM invoices WHERE contract_id = ? ORDER BY due_date', c.id);
  assert.equal(inv.length, 12);
  assert.equal(inv[0].due_date, today());
  assert.equal(inv[1].due_date.slice(8), '10');
  assert.throws(() => billing.createContract({ gymId, memberId: m, planId }), /já tem plano ativo/);
});

test('Recepção limitada a 10% de desconto', () => {
  const m = mk('Bia');
  assert.throws(() => billing.createContract({ gymId, memberId: m, planId, discountPct: 15, user: { role: 'recepcao' } }), /até 10%/);
  assert.ok(billing.createContract({ gymId, memberId: m, planId, discountPct: 15, user: { role: 'dono' } }));
});

test('Catraca: inadimplência respeita tolerância', () => {
  const m = mk('Caio');
  const c = billing.createContract({ gymId, memberId: m, planId });
  const first = one('SELECT id FROM invoices WHERE contract_id = ? ORDER BY due_date LIMIT 1', c.id);
  run('UPDATE invoices SET due_date = ? WHERE id = ?', addDays(today(), -5), first.id);
  const noon = new Date(new Date().setHours(12, 0, 0));
  assert.equal(evaluateAccess({ gym: gym(), memberId: m, at: noon }).granted, true); // 5 dias = dentro da tolerância
  run('UPDATE invoices SET due_date = ? WHERE id = ?', addDays(today(), -6), first.id);
  assert.equal(evaluateAccess({ gym: gym(), memberId: m, at: noon }).code, 'INADIMPLENTE');
  assert.equal(evaluateAccess({ gym: gym(), memberId: m, direction: 'saida', at: noon }).granted, true); // saída nunca bloqueia
});

test('Catraca: horário e dia do plano diurno', () => {
  const m = mk('Davi');
  billing.createContract({ gymId, memberId: m, planId: diurno });
  run(`UPDATE invoices SET status='pago' WHERE member_id = ?`, m);
  const d = new Date();
  const weekday = new Date(d);
  while ([0, 6].includes(weekday.getDay())) weekday.setDate(weekday.getDate() + 1);
  if (weekday.toDateString() === d.toDateString()) {
    assert.equal(evaluateAccess({ gym: gym(), memberId: m, at: new Date(weekday.setHours(18)) }).code, 'FORA_HORARIO');
    assert.equal(evaluateAccess({ gym: gym(), memberId: m, at: new Date(weekday.setHours(10)) }).granted, true);
  } else {
    assert.equal(evaluateAccess({ gym: gym(), memberId: m, at: new Date(d.setHours(10)) }).code, 'FORA_DIA');
  }
});

test('Trancamento prorroga contrato e empurra vencimentos', () => {
  const m = mk('Eva');
  const c = billing.createContract({ gymId, memberId: m, planId });
  run(`UPDATE invoices SET status='pago' WHERE contract_id = ? AND due_date <= ?`, c.id, today());
  const before = all(`SELECT due_date FROM invoices WHERE contract_id = ? AND status='pendente' ORDER BY due_date`, c.id);
  assert.throws(() => billing.freezeContract({ gymId, contractId: c.id, days: 5 }), /mínimo/);
  assert.throws(() => billing.freezeContract({ gymId, contractId: c.id, days: 31 }), /Saldo/);
  const r = billing.freezeContract({ gymId, contractId: c.id, startDate: addDays(today(), 1), days: 10 });
  assert.equal(r.newEndDate, addDays(c.end_date, 10));
  const after = all(`SELECT due_date FROM invoices WHERE contract_id = ? AND status='pendente' ORDER BY due_date`, c.id);
  assert.equal(after[0].due_date, addDays(before[0].due_date, 10));
});

test('Cancelamento com fidelidade cobra multa sobre parcelas futuras', () => {
  const m = mk('Fábio');
  const c = billing.createContract({ gymId, memberId: m, planId });
  const r = billing.cancelContract({ gymId, contractId: c.id, reason: 'Mudança' });
  assert.equal(r.futureInvoices, 11);
  assert.equal(r.fineCents, Math.round(11 * 10000 * 0.3));
  assert.equal(one(`SELECT COUNT(*) AS n FROM invoices WHERE contract_id = ? AND status = 'cancelado'`, c.id).n, 11);
  assert.equal(one(`SELECT status FROM contracts WHERE id = ?`, c.id).status, 'cancelado');
});
