export const onlyDigits = (s) => String(s ?? '').replace(/\D/g, '');

const checkDigit = (digits) => {
  const len = digits.length;
  const sum = digits.reduce((s, d, i) => s + d * (len + 1 - i), 0);
  const r = (sum * 10) % 11;
  return r === 10 ? 0 : r;
};

export function isValidCPF(input) {
  const c = onlyDigits(input);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const n = c.split('').map(Number);
  return checkDigit(n.slice(0, 9)) === n[9] && checkDigit(n.slice(0, 10)) === n[10];
}

/** Gera um CPF matematicamente válido (apenas para dados de demonstração). */
export function fakeCPF(rand = Math.random) {
  const n = Array.from({ length: 9 }, () => Math.floor(rand() * 10));
  n.push(checkDigit(n));
  n.push(checkDigit(n));
  return n.join('');
}

export const formatCPF = (c) => onlyDigits(c).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
