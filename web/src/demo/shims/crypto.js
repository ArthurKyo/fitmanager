// Subconjunto de node:crypto usado pela API, implementado com @noble (auditado, sem dependências).
import { Buffer } from './buffer.js';
import { sha256 } from '@noble/hashes/sha256';
import { hmac } from '@noble/hashes/hmac';
import { scrypt } from '@noble/hashes/scrypt';
import { gcm } from '@noble/ciphers/aes';

const bytes = (d, enc) => (typeof d === 'string' ? Buffer.from(d, enc || 'utf8') : Buffer.from(d));
const out = (b, enc) => (enc ? Buffer.from(b).toString(enc) : Buffer.from(b));

function hasher(digestFn) {
  const parts = [];
  return {
    update(d, enc) {
      parts.push(bytes(d, enc));
      return this;
    },
    digest(enc) {
      return out(digestFn(Buffer.concat(parts)), enc);
    },
  };
}

export const createHash = () => hasher((data) => sha256(data));
export const createHmac = (_alg, key) => hasher((data) => hmac(sha256, bytes(key), data));

export function randomBytes(n) {
  const b = Buffer.alloc(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

export const randomUUID = () => globalThis.crypto.randomUUID();

/** Mesmos parâmetros padrão do Node (N=16384, r=8, p=1), então hashes gerados no servidor continuam válidos. */
export const scryptSync = (pw, salt, keylen, o = {}) =>
  Buffer.from(scrypt(bytes(pw), bytes(salt), { N: o.N || o.cost || 16384, r: o.r || o.blockSize || 8, p: o.p || o.parallelization || 1, dkLen: keylen }));

export function timingSafeEqual(a, b) {
  if (a.length !== b.length) throw new RangeError('Input buffers must have the same byte length');
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** AES-256-GCM no formato de uso da API: update() acumula, final() cifra, getAuthTag() devolve a tag. */
export function createCipheriv(_alg, key, iv) {
  const chunks = [];
  let tag;
  return {
    update(d, enc) {
      chunks.push(bytes(d, enc));
      return Buffer.alloc(0);
    },
    final() {
      const sealed = gcm(bytes(key), bytes(iv)).encrypt(Buffer.concat(chunks));
      tag = Buffer.from(sealed.slice(-16));
      return Buffer.from(sealed.slice(0, -16));
    },
    getAuthTag: () => tag,
  };
}

export function createDecipheriv(_alg, key, iv) {
  const chunks = [];
  let tag;
  return {
    setAuthTag(t) {
      tag = bytes(t);
    },
    update(d) {
      chunks.push(bytes(d));
      return Buffer.alloc(0);
    },
    final: () => Buffer.from(gcm(bytes(key), bytes(iv)).decrypt(Buffer.concat([...chunks, tag]))),
  };
}

export default { createHash, createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual, createCipheriv, createDecipheriv };
