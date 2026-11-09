import { one, all, run, tx } from '../db.js';
import { today, now, diffDays } from '../lib/time.js';
import { unseal } from '../lib/auth.js';
import { bad, notFound } from '../lib/http.js';
import { invoiceView, payInvoice } from '../domain/billing.js';
import { asaas, GatewayError } from './asaas.js';
import { simulated } from './simulated.js';

/**
 * Taxa do FitManager por pagamento recebido online (vai por split para a carteira da plataforma).
 * Padrão: 0,9% com mínimo de R$ 0,39. A academia vê a taxa na tela de recebimentos.
 */
export const FEE = {
  pct: Number(process.env.FM_FEE_PCT ?? 0.9),
  minCents: Number(process.env.FM_FEE_MIN_CENTS ?? 39),
  wallet: process.env.FM_PLATFORM_WALLET_ID || null,
};
export const platformFee = (amountCents) => Math.min(amountCents, Math.max(FEE.minCents, Math.round((amountCents * FEE.pct) / 100)));

/** Débito automático: tenta no vencimento, 2 e 5 dias depois. Depois disso, só a régua manual. */
export const AUTOPAY_RETRY_DAYS = [0, 2, 5];

export function gatewayFor(gym) {
  if (gym.pay_provider === 'asaas') return asaas({ apiKey: unseal(gym.pay_api_key_enc), env: gym.pay_env });
  if (gym.pay_provider === 'simulado') return simulated({ gym });
  return null;
}
const requireGateway = (gym) => {
  const gw = gatewayFor(gym);
  if (!gw) throw bad('A academia ainda não ativou pagamentos online. Pague na recepção.');
  return gw;
};

const METHOD_TO_INVOICE = { pix: 'pix', boleto: 'boleto', cartao: 'cartao_credito' };

export function chargeView(c) {
  if (!c) return null;
  const { gym_id, ...rest } = c;
  return rest;
}

async function customerFor(gym, gw, member) {
  const prof = one('SELECT * FROM payment_profiles WHERE member_id = ?', member.id);
  const customerId = await gw.ensureCustomer(member, prof?.provider === gw.name ? prof.customer_id : null);
  if (!prof)
    run('INSERT INTO payment_profiles (member_id, gym_id, provider, customer_id, updated_at) VALUES (?,?,?,?,?)', member.id, gym.id, gw.name, customerId, now());
  else if (prof.customer_id !== customerId || prof.provider !== gw.name)
    run('UPDATE payment_profiles SET provider = ?, customer_id = ?, card_token = NULL, card_brand = NULL, card_last4 = NULL, autopay = 0, updated_at = ? WHERE member_id = ?', gw.name, customerId, now(), member.id);
  return customerId;
}

/** Valor a cobrar hoje: no prazo cobra o valor de face (o gateway aplica multa/juros se atrasar); vencida cobra o acumulado. */
function amountNow(inv) {
  const on = today();
  if (inv.due_date >= on) return { amountCents: inv.amount_cents, dueDate: inv.due_date, overdue: false };
  return { amountCents: invoiceView(inv, on).due_cents, dueDate: on, overdue: true };
}

function loadInvoice(gym, invoiceId, memberId) {
  const inv = memberId
    ? one('SELECT * FROM invoices WHERE id = ? AND gym_id = ? AND member_id = ?', invoiceId, gym.id, memberId)
    : one('SELECT * FROM invoices WHERE id = ? AND gym_id = ?', invoiceId, gym.id);
  if (!inv) throw notFound('Fatura');
  if (inv.status !== 'pendente') throw bad(inv.status === 'pago' ? 'Esta fatura já está paga' : 'Esta fatura foi cancelada');
  return inv;
}

/** Pix ou boleto com confirmação automática. Reaproveita a cobrança aberta do dia, se houver. */
export async function checkout({ gym, invoiceId, memberId, method, origin = 'app' }) {
  if (!['pix', 'boleto'].includes(method)) throw bad('Forma de pagamento inválida');
  const gw = requireGateway(gym);
  const inv = loadInvoice(gym, invoiceId, memberId);
  const { amountCents, dueDate, overdue } = amountNow(inv);

  const open = one(
    `SELECT * FROM gateway_charges WHERE invoice_id = ? AND method = ? AND status = 'pendente' AND provider = ? ORDER BY id DESC LIMIT 1`,
    inv.id,
    method,
    gw.name
  );
  if (open && open.amount_cents === amountCents && open.created_at.slice(0, 10) === today()) return chargeView(open);
  if (open) await cancelCharge(gym, gw, open);

  const member = one('SELECT * FROM members WHERE id = ?', inv.member_id);
  const customerId = await customerFor(gym, gw, member);
  const fee = platformFee(amountCents);
  const r = await gw.createCharge({
    customerId,
    method,
    amountCents,
    dueDate,
    description: `${gym.name}: ${inv.description}`,
    externalReference: `inv:${inv.id}`,
    split: FEE.wallet ? [{ walletId: FEE.wallet, fixedCents: fee }] : [],
  });
  const id = run(
    `INSERT INTO gateway_charges (gym_id, invoice_id, provider, gateway_id, method, origin, amount_cents, platform_fee_cents, recovered, pix_payload, invoice_url, boleto_url, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    gym.id,
    inv.id,
    gw.name,
    r.gatewayId,
    method,
    origin,
    amountCents,
    fee,
    overdue ? 1 : 0,
    r.pixPayload || null,
    r.invoiceUrl || null,
    r.boletoUrl || null,
    now()
  ).lastInsertRowid;
  return chargeView(one('SELECT * FROM gateway_charges WHERE id = ?', id));
}

/** Liquidação: idempotente, trata pagamento em duplicidade. Chamado pelo webhook e pelo cartão aprovado na hora. */
export function settle({ gym, charge, paidCents, netCents, paidAt }) {
  return tx(() => {
    const c = one('SELECT * FROM gateway_charges WHERE id = ?', charge.id);
    if (c.status === 'pago') return 'ja_processado';
    const at = paidAt ? `${String(paidAt).slice(0, 10)} ${now().slice(11)}` : now();
    run(`UPDATE gateway_charges SET status = 'pago', net_cents = ?, paid_at = ? WHERE id = ?`, netCents ?? null, at, c.id);
    const inv = one('SELECT * FROM invoices WHERE id = ?', c.invoice_id);
    if (inv.status !== 'pendente') {
      // Pagou duas vezes (ex.: Pix no app e dinheiro na recepção). Fica sinalizado para estorno.
      run(`UPDATE gateway_charges SET failure_reason = ? WHERE id = ?`, `Pagamento em duplicidade (fatura ${inv.status}). Estornar ao aluno.`, c.id);
      run(
        'INSERT INTO audit_log (gym_id, user_id, action, entity, entity_id, detail, created_at) VALUES (?,?,?,?,?,?,?)',
        gym.id,
        null,
        'pagamento.duplicado',
        'invoice',
        inv.id,
        JSON.stringify({ charge: c.gateway_id, cents: paidCents ?? c.amount_cents }),
        now()
      );
      return 'duplicado';
    }
    payInvoice({ gymId: gym.id, invoiceId: inv.id, method: METHOD_TO_INVOICE[c.method], paidAt: at, paidCents: paidCents ?? c.amount_cents });
    return 'pago';
  });
}

async function cancelCharge(gym, gw, c) {
  run(`UPDATE gateway_charges SET status = 'cancelado' WHERE id = ? AND status = 'pendente'`, c.id);
  try {
    await gw.cancelCharge(c.gateway_id);
  } catch (e) {
    console.warn(`[pagamentos] não consegui cancelar ${c.gateway_id} no gateway: ${e.message}`);
  }
}

/** Fatura recebida por outro meio: derruba as cobranças online abertas para evitar pagamento duplo. */
export async function cancelOpenCharges(gym, invoiceId) {
  const gw = gatewayFor(gym);
  const open = all(`SELECT * FROM gateway_charges WHERE invoice_id = ? AND status = 'pendente'`, invoiceId);
  for (const c of open) {
    if (gw && c.provider === gw.name) await cancelCharge(gym, gw, c);
    else run(`UPDATE gateway_charges SET status = 'cancelado' WHERE id = ?`, c.id);
  }
}

// ---------------------------------------------------------------- Cartão
export async function saveCard({ gym, member, card, holder, autopay, remoteIp }) {
  const gw = requireGateway(gym);
  const n = String(card?.number || '').replace(/\D/g, '');
  if (n.length < 13 || n.length > 19) throw bad('Número do cartão inválido');
  if (!/^\d{3,4}$/.test(String(card.ccv || ''))) throw bad('Código de segurança inválido');
  const m = Number(card.expiryMonth);
  const y = Number(String(card.expiryYear).length === 2 ? `20${card.expiryYear}` : card.expiryYear);
  const nowD = new Date();
  if (!(m >= 1 && m <= 12) || y < nowD.getFullYear() || (y === nowD.getFullYear() && m < nowD.getMonth() + 1)) throw bad('Cartão vencido ou validade inválida');
  if (!card.holderName?.trim()) throw bad('Nome impresso no cartão');
  const customerId = await customerFor(gym, gw, member);
  const t = await gw.tokenizeCard({
    customerId,
    card: { holderName: card.holderName.trim(), number: n, expiryMonth: String(m).padStart(2, '0'), expiryYear: String(y), ccv: String(card.ccv) },
    holder: {
      name: member.name,
      email: member.email || undefined,
      cpfCnpj: member.cpf,
      postalCode: String(holder?.postalCode || '').replace(/\D/g, ''),
      addressNumber: holder?.addressNumber || 'S/N',
      phone: member.phone,
    },
    remoteIp,
  });
  run(
    'UPDATE payment_profiles SET card_token = ?, card_brand = ?, card_last4 = ?, autopay = ?, updated_at = ? WHERE member_id = ?',
    t.token,
    t.brand,
    t.last4,
    autopay ? 1 : 0,
    now(),
    member.id
  );
  return { brand: t.brand, last4: t.last4, autopay: !!autopay };
}

export async function payWithCard({ gym, invoiceId, memberId, origin = 'app', remoteIp }) {
  const gw = requireGateway(gym);
  const inv = loadInvoice(gym, invoiceId, memberId);
  const prof = one('SELECT * FROM payment_profiles WHERE member_id = ? AND provider = ?', inv.member_id, gw.name);
  if (!prof?.card_token) throw bad('Nenhum cartão salvo');
  const { amountCents, dueDate, overdue } = amountNow(inv);
  const fee = platformFee(amountCents);
  const base = [gym.id, inv.id, gw.name];
  try {
    const r = await gw.createCharge({
      customerId: prof.customer_id,
      method: 'cartao',
      amountCents,
      dueDate: dueDate < today() ? today() : dueDate,
      description: `${gym.name}: ${inv.description}`,
      externalReference: `inv:${inv.id}`,
      split: FEE.wallet ? [{ walletId: FEE.wallet, fixedCents: fee }] : [],
      cardToken: prof.card_token,
      remoteIp,
    });
    const id = run(
      `INSERT INTO gateway_charges (gym_id, invoice_id, provider, gateway_id, method, origin, amount_cents, platform_fee_cents, recovered, invoice_url, created_at)
       VALUES (?,?,?,?, 'cartao', ?,?,?,?,?,?)`,
      ...base,
      r.gatewayId,
      origin,
      amountCents,
      fee,
      overdue ? 1 : 0,
      r.invoiceUrl || null,
      now()
    ).lastInsertRowid;
    const charge = one('SELECT * FROM gateway_charges WHERE id = ?', id);
    if (r.paid) settle({ gym, charge, paidCents: amountCents, netCents: r.netCents });
    return { approved: !!r.paid, charge: chargeView(one('SELECT * FROM gateway_charges WHERE id = ?', id)) };
  } catch (e) {
    if (!(e instanceof GatewayError) || !e.declined) throw e;
    run(
      `INSERT INTO gateway_charges (gym_id, invoice_id, provider, gateway_id, method, origin, status, amount_cents, platform_fee_cents, failure_reason, created_at)
       VALUES (?,?,?,?, 'cartao', ?, 'falhou', ?, 0, ?, ?)`,
      ...base,
      `recusa_${Date.now()}_${inv.id}`,
      origin,
      amountCents,
      e.message,
      now()
    );
    return { approved: false, reason: e.message };
  }
}

/** Roda de hora em hora: cobra no cartão quem ativou débito automático. */
export async function runAutopay(on = today()) {
  const out = { tried: 0, approved: 0, declined: 0 };
  for (const gym of all(`SELECT * FROM gyms WHERE pay_provider != 'manual'`)) {
    const due = all(
      `SELECT i.* FROM invoices i JOIN payment_profiles p ON p.member_id = i.member_id
        WHERE i.gym_id = ? AND i.status = 'pendente' AND i.due_date <= ? AND p.autopay = 1 AND p.card_token IS NOT NULL AND p.provider = ?`,
      gym.id,
      on,
      gym.pay_provider
    );
    for (const inv of due) {
      const attempts = all(`SELECT created_at FROM gateway_charges WHERE invoice_id = ? AND origin = 'autopay' ORDER BY id`, inv.id);
      if (attempts.length >= AUTOPAY_RETRY_DAYS.length) continue;
      if (attempts.some((a) => a.created_at.slice(0, 10) === on)) continue;
      if (diffDays(inv.due_date, on) < AUTOPAY_RETRY_DAYS[attempts.length]) continue;
      out.tried++;
      try {
        const r = await payWithCard({ gym, invoiceId: inv.id, origin: 'autopay' });
        r.approved ? out.approved++ : out.declined++;
      } catch (e) {
        console.warn(`[débito automático] fatura ${inv.id}: ${e.message}`);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- Webhook
export async function handleWebhook({ gym, body }) {
  const gw = requireGateway(gym);
  const ev = gw.parseWebhook(body);
  if (!ev) return { ignored: true };
  try {
    run(
      'INSERT INTO webhook_events (provider, event_id, gym_id, event, payload, received_at) VALUES (?,?,?,?,?,?)',
      gw.name,
      ev.eventId,
      gym.id,
      ev.event,
      JSON.stringify(body).slice(0, 8000),
      now()
    );
  } catch {
    return { duplicate: true }; // gateways reenviam; processar duas vezes daria baixa dupla
  }
  const done = (result) => (run('UPDATE webhook_events SET result = ? WHERE provider = ? AND event_id = ?', result, gw.name, ev.eventId), { result });

  const charge = one('SELECT * FROM gateway_charges WHERE provider = ? AND gateway_id = ? AND gym_id = ?', gw.name, ev.gatewayId, gym.id);
  if (!charge) return done('cobranca_desconhecida');
  if (!ev.status) return done('sem_efeito');

  if (ev.status === 'pago') return done(settle({ gym, charge, paidCents: ev.amountCents, netCents: ev.netCents, paidAt: ev.paidAt }));

  if (ev.status === 'estornado') {
    tx(() => {
      run(`UPDATE gateway_charges SET status = 'estornado' WHERE id = ?`, charge.id);
      if (charge.status === 'pago') {
        // Estorno/chargeback: a fatura volta a ficar em aberto e a catraca passa a considerar de novo.
        const inv = one('SELECT * FROM invoices WHERE id = ?', charge.invoice_id);
        if (inv.status === 'pago' && !one(`SELECT id FROM gateway_charges WHERE invoice_id = ? AND status = 'pago' AND id != ?`, inv.id, charge.id))
          run(`UPDATE invoices SET status = 'pendente', paid_at = NULL, paid_cents = NULL, method = NULL WHERE id = ?`, inv.id);
        run(
          'INSERT INTO audit_log (gym_id, user_id, action, entity, entity_id, detail, created_at) VALUES (?,?,?,?,?,?,?)',
          gym.id,
          null,
          'pagamento.estornado',
          'invoice',
          inv.id,
          JSON.stringify({ charge: charge.gateway_id, event: ev.event }),
          now()
        );
      }
    });
    return done('estornado');
  }
  run(`UPDATE gateway_charges SET status = ? WHERE id = ? AND status = 'pendente'`, ev.status, charge.id);
  return done(ev.status);
}

/** Simulador: gera o evento de "pagamento recebido" como o banco faria. */
export function simulatePaid(gym, charge) {
  if (gym.pay_provider !== 'simulado') throw bad('Disponível só no modo de testes');
  if (charge.status !== 'pendente') throw bad('Cobrança não está aberta');
  return handleWebhook({
    gym,
    body: {
      eventId: `sim_${charge.gateway_id}`,
      event: 'PAYMENT_RECEIVED',
      status: 'pago',
      gatewayId: charge.gateway_id,
      amountCents: charge.amount_cents,
      netCents: charge.amount_cents - (charge.method === 'boleto' ? 199 : 99),
      method: charge.method,
      paidAt: today(),
    },
  });
}
