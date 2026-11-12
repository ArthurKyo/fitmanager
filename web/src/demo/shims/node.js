// node:fs, node:path, node:url e node:events no mínimo que a API usa. No navegador não há disco:
// arquivos de segredo não existem e a configuração vem de process.env (ver ../server.js).
// Disco em memória (vazio no começo). Um Map em vez de "return false" impede que o empacotador
// elimine código da API achando que o resultado é constante.
const files = new Map();
export const existsSync = (p) => files.has(String(p));
export const readFileSync = (p) => files.get(String(p)) ?? '';
export const writeFileSync = (p, data) => void files.set(String(p), String(data));
export const unlinkSync = (p) => void files.delete(String(p));
export const mkdirSync = () => {};

export const join = (...p) => p.filter(Boolean).join('/').replace(/\/+/g, '/');
export const resolve = join;
export const dirname = (p) => String(p).replace(/\/[^/]*$/, '') || '/';
export const basename = (p) => String(p).split('/').pop();
export const sep = '/';

export const fileURLToPath = (u) => String(u);
export const pathToFileURL = (p) => new URL(p, 'file:///');

export class EventEmitter {
  #h = new Map();
  on(ev, fn) {
    if (!this.#h.has(ev)) this.#h.set(ev, new Set());
    this.#h.get(ev).add(fn);
    return this;
  }
  off(ev, fn) {
    this.#h.get(ev)?.delete(fn);
    return this;
  }
  removeListener(ev, fn) {
    return this.off(ev, fn);
  }
  once(ev, fn) {
    const w = (...a) => (this.off(ev, w), fn(...a));
    return this.on(ev, w);
  }
  emit(ev, ...a) {
    const set = this.#h.get(ev);
    if (!set?.size) return false;
    for (const fn of [...set]) fn(...a);
    return true;
  }
  listenerCount(ev) {
    return this.#h.get(ev)?.size || 0;
  }
  setMaxListeners() {
    return this;
  }
}

export default {
  existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync,
  join, resolve, dirname, basename, sep,
  fileURLToPath, pathToFileURL, EventEmitter,
};
