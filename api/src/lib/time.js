// Toda regra de negócio roda no fuso da academia. O processo inteiro usa esse TZ,
// então os métodos locais de Date já devolvem horário de Brasília.
process.env.TZ = process.env.FM_TZ || 'America/Sao_Paulo';

const pad = (n) => String(n).padStart(2, '0');

export const dateStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const dateTimeStr = (d = new Date()) =>
  `${dateStr(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
export const today = () => dateStr();
export const now = () => dateTimeStr();

export function parseDate(s) {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d, 12); // meio-dia evita bordas de horário de verão
}

export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return dateStr(d);
}

/** Soma meses mantendo o dia; se o mês não tem o dia (31/02), usa o último dia do mês. */
export function addMonths(s, n, day) {
  const d = parseDate(s);
  const target = day ?? d.getDate();
  const first = new Date(d.getFullYear(), d.getMonth() + n, 1, 12);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12).getDate();
  first.setDate(Math.min(target, last));
  return dateStr(first);
}

export const diffDays = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);

export function age(birth, on = today()) {
  const [by, bm, bd] = birth.split('-').map(Number);
  const [ty, tm, td] = on.split('-').map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

export const isValidDate = (s) =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && dateStr(parseDate(s)) === s;
