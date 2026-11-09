import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { one, all, run } from '../db.js';
import { h, bad, notFound, HttpError } from '../lib/http.js';
import { now, today, addMonths, addDays } from '../lib/time.js';
import { seal, randomToken, safeEqualStr } from '../lib/auth.js';
import { allow } from '../middleware.js';
import { asaas } from '../payments/asaas.js';
import { checkout, chargeView, simulatePaid, handleWebhook, FEE, platformFee, gatewayFor } from '../payments/service.js';

export const staffPayments = Router();
export const paySettings = Router();
export const payWebhooks = Router();
export const platform = Router();

// ---------- Recepção: cobrança online de uma fatura (ex.: QR Pix no balcão com baixa automática)
staffPayments.post(
  '/invoices/:id/checkout',
  allow('dono', 'recepcao'),
  h((req) => checkout({ gym: req.gym, invoiceId: req.params.id, method: req.body?.method || 'pix', origin: 'recepcao' }))
);

staffPayments.get(
  '/invoices/:id/charges',
  allow('dono', 'recepcao'),
  h((req) => all('SELECT * FROM gateway_charges WHERE invoice_id = ? AND gym_id = ? ORDER BY id DESC', req.params.id, req.gym.id).map(chargeView))
);

staffPayments.post(
  '/charges/:id/simulate-paid',
  allow('dono', 'recepcao'),
  h(async (req) => {
    const c = one('SELECT * FROM gateway_charges WHERE id = ? AND gym_id = ?', req.params.id, req.gym.id);
    if (!c) throw notFound('Cobrança');
    return simulatePaid(req.gym, c);
  })
);

// ---------- Configuração de recebimentos (dono)
paySettings.use(allow('dono'));

function payStatus(req) {
  const g = one('SELECT * FROM gyms WHERE id = ?', req.gym.id);
  const base = process.env.FM_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  const month = today().slice(0, 7);
  const stats = one(
    `SELECT COUNT(*) AS n, COALESCE(SUM(amount_cents),0) AS gross, COALESCE(SUM(platform_fee_cents),0) AS fees,
            COALESCE(SUM(CASE WHEN recovered = 1 THEN amount_cents END),0) AS recovered,
            COALESCE(SUM(CASE WHEN origin = 'autopay' THEN amount_cents END),0) AS autopay
       FROM gateway_charges WHERE gym_id = ? AND status = 'pago' AND substr(paid_at,1,7) = ?`,
    g.id,
    month
  );
  return {
    provider: g.pay_provider,
    env: g.pay_env,
    connected_at: g.pay_connected_at,
    has_key: !!g.pay_api_key_enc,
    webhook_url: g.pay_provider === 'asaas' ? `${base}/api/webhooks/asaas/${g.id}` : null,
    webhook_token: g.pay_provider === 'asaas' ? g.pay_webhook_token : null,
    fee: { pct: FEE.pct, min_cents: FEE.minCents, example_cents: platformFee(14990) },
    autopay_members: one(`SELECT COUNT(*) AS n FROM payment_profiles WHERE gym_id = ? AND autopay = 1 AND card_token IS NOT NULL`, g.id).n,
    month: { payments: stats.n, gross_cents: stats.gross, fees_cents: stats.fees, recovered_cents: stats.recovered, autopay_cents: stats.autopay },
  };
}

paySettings.get('/', h(payStatus));

/** Conecta a conta Asaas da academia (chave validada antes de salvar) ou alterna entre manual/simulado. */
paySettings.put(
  '/',
  h(async (req) => {
    const { provider, env, api_key } = req.body || {};
    if (!['manual', 'simulado', 'asaas'].includes(provider)) throw bad('Provedor inválido');
    if (provider === 'asaas') {
      const e = env === 'production' ? 'production' : 'sandbox';
      const current = one('SELECT pay_api_key_enc FROM gyms WHERE id = ?', req.gym.id).pay_api_key_enc;
      if (!api_key && !current) throw bad('Cole a chave de API da conta Asaas da academia');
      if (api_key) {
        try {
          await asaas({ apiKey: api_key.trim(), env: e }).verify();
        } catch (ex) {
          throw bad(`O Asaas recusou a chave: ${ex.message}. Confira se é do ambiente ${e === 'production' ? 'de produção' : 'sandbox'}.`);
        }
        run('UPDATE gyms SET pay_api_key_enc = ? WHERE id = ?', seal(api_key.trim()), req.gym.id);
      }
      run(
        `UPDATE gyms SET pay_provider = 'asaas', pay_env = ?, pay_connected_at = ?, pay_webhook_token = COALESCE(pay_webhook_token, ?) WHERE id = ?`,
        e,
        now(),
        randomToken(24),
        req.gym.id
      );
    } else {
      run('UPDATE gyms SET pay_provider = ?, pay_connected_at = ? WHERE id = ?', provider, provider === 'manual' ? null : now(), req.gym.id);
    }
    run(
      'INSERT INTO audit_log (gym_id, user_id, action, entity, entity_id, detail, created_at) VALUES (?,?,?,?,?,?,?)',
      req.gym.id,
      req.user.id,
      'pagamentos.configurar',
      'gym',
      req.gym.id,
      JSON.stringify({ provider, env }),
      now()
    );
    return payStatus(req);
  })
);

// ---------- Webhook Asaas (um por academia; token configurado no painel do Asaas)
payWebhooks.post(
  '/asaas/:gymId',
  h(async (req) => {
    const gym = one('SELECT * FROM gyms WHERE id = ?', req.params.gymId);
    if (!gym || gym.pay_provider !== 'asaas') throw new HttpError(404, 'Academia sem Asaas ativo');
    if (!safeEqualStr(String(req.headers['asaas-access-token'] || ''), String(gym.pay_webhook_token || ''))) throw new HttpError(401, 'Token do webhook inválido');
    const r = await handleWebhook({ gym, body: req.body });
    return { received: true, ...r };
  })
);

// ---------- Painel da plataforma (dono do FitManager)
const keyFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.platform-key');
export function platformKey() {
  if (process.env.FM_PLATFORM_KEY) return process.env.FM_PLATFORM_KEY;
  if (!fs.existsSync(keyFile)) fs.writeFileSync(keyFile, randomToken(18), { mode: 0o600 });
  return fs.readFileSync(keyFile, 'utf8').trim();
}
const SAAS_PRICE = { essencial: 18900, performance: 34900, rede: 79000 };

platform.use((req, _res, next) => (safeEqualStr(String(req.headers['x-platform-key'] || ''), platformKey()) ? next() : next(new HttpError(401, 'Chave da plataforma inválida'))));

platform.get(
  '/overview',
  h(() => {
    const on = today();
    const month = on.slice(0, 7);
    const gyms = all('SELECT * FROM gyms ORDER BY created_at').map((g) => {
      const pay = one(
        `SELECT COUNT(*) AS n, COALESCE(SUM(amount_cents),0) AS gmv, COALESCE(SUM(platform_fee_cents),0) AS fees
           FROM gateway_charges WHERE gym_id = ? AND status = 'pago' AND substr(paid_at,1,7) = ?`,
        g.id,
        month
      );
      const members = one(
        `SELECT COUNT(DISTINCT member_id) AS n FROM contracts WHERE gym_id = ? AND status = 'ativo' AND start_date <= ? AND end_date >= ?`,
        g.id,
        on,
        on
      ).n;
      const billed = one(`SELECT COALESCE(SUM(amount_cents),0) AS v FROM invoices WHERE gym_id = ? AND status != 'cancelado' AND substr(due_date,1,7) = ?`, g.id, month).v;
      const lastActivity = one(`SELECT MAX(created_at) AS at FROM access_logs WHERE gym_id = ?`, g.id).at;
      return {
        id: g.id,
        name: g.name,
        saas_plan: g.saas_plan,
        created_at: g.created_at,
        pay_provider: g.pay_provider,
        active_members: members,
        billed_cents: billed,
        online_payments: pay.n,
        gmv_cents: pay.gmv,
        fees_cents: pay.fees,
        online_share: billed ? pay.gmv / billed : 0,
        subscription_cents: SAAS_PRICE[g.saas_plan] || 0,
        last_activity: lastActivity,
      };
    });
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const m = addMonths(`${month}-01`, -i).slice(0, 7);
      const r = one(`SELECT COALESCE(SUM(platform_fee_cents),0) AS fees, COALESCE(SUM(amount_cents),0) AS gmv FROM gateway_charges WHERE status = 'pago' AND substr(paid_at,1,7) = ?`, m);
      months.push({ month: m, fees_cents: r.fees, gmv_cents: r.gmv });
    }
    const subs = gyms.reduce((s, g) => s + g.subscription_cents, 0);
    const fees = gyms.reduce((s, g) => s + g.fees_cents, 0);
    return {
      fee: { pct: FEE.pct, min_cents: FEE.minCents, wallet_configured: !!FEE.wallet },
      totals: {
        gyms: gyms.length,
        subscriptions_cents: subs,
        fees_month_cents: fees,
        revenue_month_cents: subs + fees,
        gmv_month_cents: gyms.reduce((s, g) => s + g.gmv_cents, 0),
        // potencial se 100% das mensalidades fossem pagas online
        fee_potential_cents: gyms.reduce((s, g) => s + Math.round((g.billed_cents * FEE.pct) / 100), 0),
        stale_gyms: gyms.filter((g) => !g.last_activity || g.last_activity < addDays(on, -7)).length,
      },
      months,
      gyms,
    };
  })
);

export { gatewayFor };
