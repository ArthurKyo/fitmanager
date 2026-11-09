/**
 * Gateway simulado: mesma interface do Asaas, sem rede. Serve para demonstração,
 * desenvolvimento e testes. Pix é um BR Code válido; a confirmação acontece pelo
 * botão "Simular pagamento do banco", que dispara o mesmo fluxo de webhook.
 *
 * Cartões de teste:
 *   4111 1111 1111 1111  aprovado
 *   4000 0000 0000 0002  recusado (saldo insuficiente)
 */
import crypto from 'node:crypto';
import { brCode } from '../lib/pix.js';
import { GatewayError } from './asaas.js';

const id = (p) => `${p}_${crypto.randomBytes(6).toString('hex')}`;
export const DECLINE_CARD = '4000000000000002';

export function simulated({ gym }) {
  return {
    name: 'simulado',
    async verify() {
      return { ok: true, balanceCents: 0 };
    },
    async ensureCustomer(member, existingId) {
      return existingId || id('cus');
    },
    async createCharge({ method, amountCents, cardToken }) {
      const gatewayId = id('pay');
      if (method === 'cartao') {
        // token sem estado: o resultado do cartão de teste vai codificado nele
        if (!String(cardToken).startsWith('simtok_')) throw new GatewayError('Cartão não encontrado. Cadastre novamente.', { status: 400, declined: true });
        if (cardToken.startsWith('simtok_recusa_')) throw new GatewayError('Transação não autorizada: saldo insuficiente', { status: 400, declined: true });
        return { gatewayId, status: 'CONFIRMED', paid: true, amountCents, netCents: amountCents - Math.round(amountCents * 0.0299) - 49 };
      }
      return {
        gatewayId,
        status: 'PENDING',
        paid: false,
        amountCents,
        netCents: null,
        pixPayload: method === 'pix' ? brCode({ key: gym.pix_key || 'simulado@fitmanager', merchant: gym.pix_merchant || gym.name, city: gym.pix_city, amountCents, txid: gatewayId.replace('_', '') }) : null,
        boletoUrl: method === 'boleto' ? `/boleto-simulado/${gatewayId}` : null,
        invoiceUrl: null,
      };
    },
    async cancelCharge() {},
    async tokenizeCard({ card }) {
      const number = String(card.number).replace(/\D/g, '');
      if (number.length < 13) throw new GatewayError('Número de cartão inválido', { status: 400, declined: true });
      const token = id(number === DECLINE_CARD ? 'simtok_recusa' : 'simtok_ok');
      return { token, brand: number.startsWith('5') ? 'MASTERCARD' : 'VISA', last4: number.slice(-4) };
    },
    parseWebhook(body) {
      return body; // o simulador já gera o evento normalizado
    },
  };
}
