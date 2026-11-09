// Fluxos de pagamento com o gateway simulado, contra banco em memória.
process.env.FM_DB = ':memory:';
process.env.FM_SECRET = 'test-secret';
process.env.FM_FEE_PCT = '0.9';
process.env.FM_FEE_MIN_CENTS = '39';

import test from 'node:test';
import assert from 'node:assert/strict';

const { run, one } = await import('../src/db.js');
const { fakeCPF } = await import('../src/lib/cpf.js');
const { today, addDays } = await import('../src/lib/time.js');
const { seal, unseal } = await import('../src/lib/auth.js');
const billing = await import('../src/domain/billing.js');
const pay = await import('../src/payments/service.js');

const gymId = run(`INSERT INTO gyms (name, slug, pix_key, created_at, pay_provider) VALUES ('G','g','pix@g.com','2026-01-01','simulado')`).lastInsertRowid;
const gym = () => one('SELECT * FROM gyms WHERE id = ?', gymId);
const planId = run(`INSERT INTO plans (gym_id, name, months, price_cents) VALUES (?, 'Trimestral', 3, 15000)`, gymId).lastInsertRowid;
function newMember() {
  const id = run(`INSERT INTO members (gym_id, name, cpf, birth_date, medical_valid_until, created_at) VALUES (?,?,?,?,?,?)`, gymId, 'Ana', fakeCPF(), '1990-01-01', addDays(today(), 300), today()).lastInsertRowid;
  const c = billing.createContract({ gymId, memberId: id, planId });
  const invs = run && one('SELECT id FROM invoices WHERE contract_id = ? ORDER BY due_date LIMIT 1', c.id);
  return { id, invoiceId: invs.id };
}

test('Taxa da plataforma: percentual com mínimo', () => {
  assert.equal(pay.platformFee(14990), 135);
  assert.equal(pay.platformFee(2000), 39);
  assert.equal(pay.platformFee(20), 20); // nunca maior que o pagamento
});

test('Cofre: chave do gateway criptografada e recuperável', () => {
  const s = seal('$aact_abc');
  assert.notEqual(s, '$aact_abc');
  assert.equal(unseal(s), '$aact_abc');
});

test('Pix: checkout reaproveita cobrança do dia e baixa é idempotente', async () => {
  const m = newMember();
  const c1 = await pay.checkout({ gym: gym(), invoiceId: m.invoiceId, memberId: m.id, method: 'pix' });
  const c2 = await pay.checkout({ gym: gym(), invoiceId: m.invoiceId, memberId: m.id, method: 'pix' });
  assert.equal(c1.id, c2.id);
  assert.match(c1.pix_payload, /^000201/);
  assert.equal((await pay.simulatePaid(gym(), one('SELECT * FROM gateway_charges WHERE id = ?', c1.id))).result, 'pago');
  assert.equal(one('SELECT status, method FROM invoices WHERE id = ?', m.invoiceId).status, 'pago');
  // mesmo evento reentregue pelo gateway
  const again = await pay.handleWebhook({ gym: gym(), body: { eventId: `sim_${c1.gateway_id}`, event: 'PAYMENT_RECEIVED', status: 'pago', gatewayId: c1.gateway_id, amountCents: 15000 } });
  assert.equal(again.duplicate, true);
});

test('Pagamento em duplicidade fica sinalizado para estorno', async () => {
  const m = newMember();
  const c = await pay.checkout({ gym: gym(), invoiceId: m.invoiceId, memberId: m.id, method: 'pix' });
  billing.payInvoice({ gymId, invoiceId: m.invoiceId, method: 'dinheiro' });
  const r = await pay.handleWebhook({ gym: gym(), body: { eventId: 'dup1', event: 'PAYMENT_RECEIVED', status: 'pago', gatewayId: c.gateway_id, amountCents: 15000 } });
  assert.equal(r.result, 'duplicado');
  assert.match(one('SELECT failure_reason FROM gateway_charges WHERE id = ?', c.id).failure_reason, /duplicidade/);
});

test('Estorno reabre a fatura', async () => {
  const m = newMember();
  const c = await pay.checkout({ gym: gym(), invoiceId: m.invoiceId, memberId: m.id, method: 'pix' });
  await pay.simulatePaid(gym(), one('SELECT * FROM gateway_charges WHERE id = ?', c.id));
  await pay.handleWebhook({ gym: gym(), body: { eventId: 'ref1', event: 'PAYMENT_REFUNDED', status: 'estornado', gatewayId: c.gateway_id, amountCents: 15000 } });
  assert.equal(one('SELECT status FROM invoices WHERE id = ?', m.invoiceId).status, 'pendente');
});

test('Recebimento no balcão cancela cobrança online aberta', async () => {
  const m = newMember();
  const c = await pay.checkout({ gym: gym(), invoiceId: m.invoiceId, memberId: m.id, method: 'boleto' });
  billing.payInvoice({ gymId, invoiceId: m.invoiceId, method: 'dinheiro' });
  await pay.cancelOpenCharges(gym(), m.invoiceId);
  assert.equal(one('SELECT status FROM gateway_charges WHERE id = ?', c.id).status, 'cancelado');
});

test('Fatura vencida é cobrada com multa e juros e conta como recuperada', async () => {
  const m = newMember();
  run('UPDATE invoices SET due_date = ? WHERE id = ?', addDays(today(), -10), m.invoiceId);
  const c = await pay.checkout({ gym: gym(), invoiceId: m.invoiceId, memberId: m.id, method: 'pix' });
  assert.equal(c.amount_cents, 15000 + 300 + 50);
  assert.equal(c.recovered, 1);
});

test('Débito automático: recusa registrada e novas tentativas só em D+2 e D+5', async () => {
  const m = newMember();
  const member = one('SELECT * FROM members WHERE id = ?', m.id);
  await pay.saveCard({ gym: gym(), member, card: { holderName: 'ANA', number: '4000000000000002', expiryMonth: '12', expiryYear: '2031', ccv: '123' }, autopay: true });
  run('UPDATE invoices SET due_date = ? WHERE id = ?', today(), m.invoiceId);
  run(`UPDATE invoices SET due_date = ? WHERE member_id = ? AND id != ?`, addDays(today(), 40), m.id, m.invoiceId);
  let r = await pay.runAutopay();
  assert.equal(r.declined, 1);
  r = await pay.runAutopay(); // mesmo dia: não tenta de novo
  assert.equal(r.tried, 0);
  r = await pay.runAutopay(addDays(today(), 1)); // D+1: ainda não
  assert.equal(r.tried, 0);
  await pay.saveCard({ gym: gym(), member, card: { holderName: 'ANA', number: '4111111111111111', expiryMonth: '12', expiryYear: '2031', ccv: '123' }, autopay: true });
  r = await pay.runAutopay(addDays(today(), 2));
  assert.equal(r.approved, 1);
  assert.equal(one('SELECT status FROM invoices WHERE id = ?', m.invoiceId).status, 'pago');
});
