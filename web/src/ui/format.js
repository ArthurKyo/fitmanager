const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const money = (cents) => brl.format((cents || 0) / 100);
export const moneyShort = (cents) => {
  const v = (cents || 0) / 100;
  return v >= 10000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : brl.format(v);
};
export const date = (s) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '—');
export const dateShort = (s) => (s ? s.slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '—');
export const time = (s) => (s ? s.slice(11, 16) : '');
export const cpf = (c) => String(c || '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
export const phone = (p) => {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return p || '';
};
export const whatsapp = (p, text) => `https://wa.me/55${String(p || '').replace(/\D/g, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
export const pct = (x) => `${Math.round((x || 0) * 100)}%`;
export const firstName = (n) => String(n || '').split(' ')[0];

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function relDays(s) {
  if (!s) return '—';
  const a = new Date(`${s.slice(0, 10)}T12:00:00`);
  const b = new Date(`${todayStr()}T12:00:00`);
  const d = Math.round((b - a) / 86400000);
  if (d === 0) return 'hoje';
  if (d === 1) return 'ontem';
  if (d === -1) return 'amanhã';
  return d > 0 ? `há ${d} dias` : `em ${-d} dias`;
}

export const SITUATION = {
  em_dia: { tone: 'green', label: 'Em dia' },
  vence_logo: { tone: 'blue', label: 'Renovação próxima' },
  vencido: { tone: 'yellow', label: 'Atrasado, ainda entra' },
  bloqueado: { tone: 'red', label: 'Bloqueado' },
  trancado: { tone: '', label: 'Trancado' },
  sem_plano: { tone: '', label: 'Sem plano' },
  inativo: { tone: '', label: 'Inativo' },
};

export const METHOD = { digital: 'Digital', facial: 'Facial', cartao: 'Cartão', qrcode: 'QR do app', manual: 'Recepção' };
export const PAY = { pix: 'Pix', cartao_credito: 'Crédito', cartao_debito: 'Débito', dinheiro: 'Dinheiro', boleto: 'Boleto' };
export const WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
