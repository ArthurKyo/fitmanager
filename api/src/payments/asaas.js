/**
 * Adaptador Asaas (API v3). A cobrança é criada na conta Asaas da ACADEMIA (chave dela);
 * a taxa do FitManager vai por split para a carteira da plataforma (FM_PLATFORM_WALLET_ID).
 * O dinheiro nunca passa pela conta do FitManager.
 *
 * Endpoints usados: /customers, /payments, /payments/{id}/pixQrCode, /payments/{id} (DELETE),
 * /creditCard/tokenizeCreditCard, /finance/balance. Webhook: header "asaas-access-token".
 */
const BASE = {
  sandbox: process.env.FM_ASAAS_SANDBOX_URL || 'https://api-sandbox.asaas.com/v3',
  production: process.env.FM_ASAAS_URL || 'https://api.asaas.com/v3',
};

export class GatewayError extends Error {
  constructor(message, { status, code, declined } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.declined = !!declined;
  }
}

const reais = (cents) => Math.round(cents) / 100;
const cents = (v) => Math.round(Number(v) * 100);

export function asaas({ apiKey, env }) {
  const base = BASE[env] || BASE.sandbox;

  async function call(method, path, body) {
    let res;
    try {
      res = await fetch(`${base}${path}`, {
        method,
        headers: { 'content-type': 'application/json', access_token: apiKey, 'User-Agent': 'FitManager/1.0' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      throw new GatewayError(`Gateway indisponível (${e.name}). Tente de novo em instantes.`, { status: 503 });
    }
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const err = data.errors?.[0];
      // Recusa de cartão volta como 400 com código específico; não é erro do sistema.
      const declined = /invalid_creditCard|card|cartão|recusad/i.test(`${err?.code} ${err?.description}`);
      throw new GatewayError(err?.description || `Erro ${res.status} no gateway`, { status: res.status, code: err?.code, declined });
    }
    return data;
  }

  const toCharge = (p) => ({
    gatewayId: p.id,
    status: p.status,
    amountCents: cents(p.value),
    netCents: p.netValue != null ? cents(p.netValue) : null,
    invoiceUrl: p.invoiceUrl || null,
    boletoUrl: p.bankSlipUrl || null,
  });

  return {
    name: 'asaas',

    async verify() {
      const b = await call('GET', '/finance/balance');
      return { ok: true, balanceCents: cents(b.balance ?? 0) };
    },

    async ensureCustomer(member, existingId) {
      if (existingId) return existingId;
      const c = await call('POST', '/customers', {
        name: member.name,
        cpfCnpj: member.cpf,
        email: member.email || undefined,
        mobilePhone: member.phone || undefined,
        externalReference: `member:${member.id}`,
        notificationDisabled: true, // a régua de cobrança é do FitManager
      });
      return c.id;
    },

    /** method: pix | boleto | cartao. split: [{walletId, fixedCents}] */
    async createCharge({ customerId, method, amountCents, dueDate, description, externalReference, split, cardToken, remoteIp }) {
      const p = await call('POST', '/payments', {
        customer: customerId,
        billingType: method === 'pix' ? 'PIX' : method === 'boleto' ? 'BOLETO' : 'CREDIT_CARD',
        value: reais(amountCents),
        dueDate,
        description: description.slice(0, 500),
        externalReference,
        fine: { value: 2, type: 'PERCENTAGE' },
        interest: { value: 1 },
        split: split?.length ? split.map((s) => ({ walletId: s.walletId, fixedValue: reais(s.fixedCents) })) : undefined,
        creditCardToken: cardToken,
        remoteIp,
      });
      const out = toCharge(p);
      if (method === 'pix') {
        const qr = await call('GET', `/payments/${p.id}/pixQrCode`);
        out.pixPayload = qr.payload;
      }
      out.paid = ['CONFIRMED', 'RECEIVED'].includes(p.status);
      return out;
    },

    async cancelCharge(gatewayId) {
      await call('DELETE', `/payments/${gatewayId}`);
    },

    /** Dados do cartão só atravessam o servidor rumo ao Asaas; nada é gravado ou logado. */
    async tokenizeCard({ customerId, card, holder, remoteIp }) {
      const t = await call('POST', '/creditCard/tokenizeCreditCard', {
        customer: customerId,
        creditCard: { holderName: card.holderName, number: card.number, expiryMonth: card.expiryMonth, expiryYear: card.expiryYear, ccv: card.ccv },
        creditCardHolderInfo: holder,
        remoteIp,
      });
      return { token: t.creditCardToken, brand: t.creditCardBrand, last4: String(t.creditCardNumber || '').slice(-4) };
    },

    /** Normaliza o webhook. Retorna null para eventos que não mexem em fatura. */
    parseWebhook(body) {
      const p = body?.payment;
      if (!p) return null;
      const map = {
        PAYMENT_CONFIRMED: 'pago',
        PAYMENT_RECEIVED: 'pago',
        PAYMENT_RECEIVED_IN_CASH: 'pago',
        PAYMENT_REFUNDED: 'estornado',
        PAYMENT_CHARGEBACK_REQUESTED: 'estornado',
        PAYMENT_DELETED: 'cancelado',
        PAYMENT_CREDIT_CARD_CAPTURE_REFUSED: 'falhou',
      };
      return {
        eventId: body.id || `${body.event}:${p.id}:${p.status}`,
        event: body.event,
        status: map[body.event] || null,
        gatewayId: p.id,
        externalReference: p.externalReference,
        amountCents: cents(p.value),
        netCents: p.netValue != null ? cents(p.netValue) : null,
        method: p.billingType === 'PIX' ? 'pix' : p.billingType === 'BOLETO' ? 'boleto' : 'cartao',
        paidAt: p.clientPaymentDate || p.paymentDate || p.confirmedDate || null,
      };
    },
  };
}
