import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const secretFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.secret');
function loadSecret() {
  if (process.env.FM_SECRET) return process.env.FM_SECRET;
  if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
  return fs.readFileSync(secretFile, 'utf8').trim();
}
const SECRET = loadSecret();

const b64 = (b) => Buffer.from(b).toString('base64url');
export const sign = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');

const safeEqual = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function issueToken(payload, ttlHours = 12) {
  const body = b64(JSON.stringify({ ...payload, exp: Date.now() + ttlHours * 3600_000 }));
  return `${body}.${sign(body)}`;
}

export function verifyToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!safeEqual(sig, sign(body))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function checkPassword(pw, stored) {
  const [, saltHex, hashHex] = String(stored).split('$');
  if (!saltHex || !hashHex) return false;
  const hash = crypto.scryptSync(String(pw), Buffer.from(saltHex, 'hex'), 32);
  return crypto.timingSafeEqual(hash, Buffer.from(hashHex, 'hex'));
}

// QR de acesso do app: muda a cada 30 s, então um print de tela não serve para outra pessoa entrar.
const QR_STEP = 30_000;
const qrSig = (memberId, step) => sign(`qr:${memberId}:${step}`).slice(0, 12);

export function accessQR(memberId, at = Date.now()) {
  const step = Math.floor(at / QR_STEP);
  return { code: `FM1.${memberId}.${step}.${qrSig(memberId, step)}`, expiresInMs: QR_STEP - (at % QR_STEP) };
}

/** Aceita o passo atual e o anterior (tolerância de leitura). */
export function readAccessQR(code, at = Date.now()) {
  const m = /^FM1\.(\d+)\.(\d+)\.([\w-]{12})$/.exec(String(code));
  if (!m) return null;
  const [, id, step, sig] = m;
  if (!safeEqual(qrSig(id, Number(step)), sig)) return null;
  const cur = Math.floor(at / QR_STEP);
  const expired = cur - Number(step) > 1 || Number(step) > cur;
  return { memberId: Number(id), expired };
}

export const randomToken = (n = 24) => crypto.randomBytes(n).toString('base64url');

// Cofre para segredos de terceiros (chave de API do gateway da academia). AES-256-GCM.
const vaultKey = crypto.createHash('sha256').update(`vault:${SECRET}`).digest();
export function seal(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', vaultKey, iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64url')).join('.');
}
export function unseal(sealed) {
  if (!sealed) return null;
  const [iv, tag, enc] = sealed.split('.').map((s) => Buffer.from(s, 'base64url'));
  const d = crypto.createDecipheriv('aes-256-gcm', vaultKey, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}
export const safeEqualStr = (a, b) => typeof a === 'string' && typeof b === 'string' && safeEqual(a, b);
