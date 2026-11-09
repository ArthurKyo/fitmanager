// Gera o "Pix Copia e Cola" (BR Code, padrão EMV MPM do Banco Central).
// Referência: Manual de Padrões para Iniciação do Pix (BCB).

const field = (id, value) => `${id}${String(value.length).padStart(2, '0')}${value}`;

export function crc16(payload) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    crc &= 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

const ascii = (s, max) =>
  String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .toUpperCase()
    .slice(0, max)
    .trim();

export function brCode({ key, merchant, city, amountCents, txid, message }) {
  if (!key) throw new Error('Chave Pix da academia não configurada');
  const account = field('00', 'br.gov.bcb.pix') + field('01', key) + (message ? field('02', ascii(message, 40)) : '');
  const tx = String(txid || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  const body =
    field('00', '01') +
    field('01', '12') + // QR de uso único
    field('26', account) +
    field('52', '0000') +
    field('53', '986') +
    (amountCents ? field('54', (amountCents / 100).toFixed(2)) : '') +
    field('58', 'BR') +
    field('59', ascii(merchant || 'ACADEMIA', 25)) +
    field('60', ascii(city || 'SAO PAULO', 15)) +
    field('62', field('05', tx)) +
    '6304';
  return body + crc16(body);
}
