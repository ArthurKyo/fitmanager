// Demonstração sem servidor: a própria API do FitManager (api/src) roda dentro do navegador.
// O SQLite é o sql.js (WebAssembly); express, crypto, fs e afins são substituídos por ./shims
// (aliases em vite.config.js). O banco é criado pelo mesmo seed.js do projeto e guardado no
// IndexedDB; a cada dia novo ele é recriado para que vencimentos e frequência façam sentido.
import './shims/buffer.js';
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { setSqlJs, current } from './shims/sqlite.js';

// process.env da API é definido em vite.config.js (FM_SECRET, FM_PLATFORM_KEY).
const VERSION = __FM_DEMO_VERSION__;
const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ---------- IndexedDB ----------
const IDB = 'fitmanager-demo';
function idb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(IDB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbGet() {
  try {
    const d = await idb();
    return await new Promise((resolve) => {
      const q = d.transaction('kv').objectStore('kv').get('db');
      q.onsuccess = () => resolve(q.result || null);
      q.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}
async function idbPut(value) {
  try {
    const d = await idb();
    d.transaction('kv', 'readwrite').objectStore('kv').put(value, 'db');
  } catch {
    /* navegação privada: a demonstração funciona, só não guarda entre visitas */
  }
}
let saveTimer = 0;
const persistSoon = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => idbPut({ version: VERSION, date: localDay(), bytes: current.export() }), 600);
};

/** Apaga o banco guardado: a próxima carga recria a academia de demonstração. */
export async function resetDemo() {
  await idbPut(null);
}

// ---------- Montagem da API (espelha api/src/server.js) ----------
let app;
let HttpError;
let accessBus;
let verifyToken;
let one;

async function boot() {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const saved = await idbGet();
  const fresh = saved && saved.version === VERSION && saved.date === localDay();
  setSqlJs(SQL, fresh ? saved.bytes : null);
  if (fresh) await import('../../../api/src/db.js');
  else await import('../../../api/src/seed.js');

  const [express, http, mw, billing, pub, members, finance, payments, access, crm, training, dash, me, auth, db] = await Promise.all([
    import('./shims/express.js'),
    import('../../../api/src/lib/http.js'),
    import('../../../api/src/middleware.js'),
    import('../../../api/src/domain/billing.js'),
    import('../../../api/src/routes/public.js'),
    import('../../../api/src/routes/members.js'),
    import('../../../api/src/routes/finance.js'),
    import('../../../api/src/routes/payments.js'),
    import('../../../api/src/routes/access.js'),
    import('../../../api/src/routes/crm.js'),
    import('../../../api/src/routes/training.js'),
    import('../../../api/src/routes/dashboard.js'),
    import('../../../api/src/routes/me.js'),
    import('../../../api/src/lib/auth.js'),
    import('../../../api/src/db.js'),
  ]);
  HttpError = http.HttpError;
  verifyToken = auth.verifyToken;
  one = db.one;
  accessBus = (await import('../../../api/src/domain/access.js')).accessBus;

  const a = express.Router();
  const { auth: authMw } = mw;
  a.get('/api/health', (_req, res) => res.json({ ok: true, demo: true }));
  a.use('/api', pub.default);
  a.use('/api/webhooks', payments.payWebhooks);
  a.use('/api/platform', payments.platform);
  a.use('/api/bridge', access.bridge);
  a.use('/api/members', authMw, members.default);
  a.use('/api/plans', authMw, finance.plans);
  a.use('/api/contracts', authMw, finance.contracts);
  a.use('/api/invoices', authMw, finance.invoices);
  a.use('/api/access', authMw, access.access);
  a.use('/api/crm', authMw, crm.default);
  a.use('/api/training', authMw, training.default);
  a.use('/api/dashboard', authMw, dash.dashboard);
  a.use('/api/settings/payments', authMw, payments.paySettings);
  a.use('/api/settings', authMw, dash.settings);
  a.use('/api', authMw, payments.staffPayments);
  a.use('/api/me', authMw, me.default);
  app = a;

  billing.closeExpiredContracts();
  const svc = await import('../../../api/src/payments/service.js');
  await svc.runAutopay().catch(() => null);
  if (!fresh) persistSoon();
}

const ready = boot();
export const whenReady = () => ready;

function errorResponse(err) {
  if (err instanceof HttpError) return { status: err.status, data: { error: err.message, ...err.extra } };
  if (String(err?.message).includes('UNIQUE constraint')) return { status: 409, data: { error: 'Registro duplicado' } };
  console.error('[demo]', err);
  return { status: 500, data: { error: 'Erro interno. Tente novamente.' } };
}

const clone = (v) => (v === undefined ? {} : JSON.parse(JSON.stringify(v)));

/** Equivalente a fetch('/api' + path). Devolve { status, data }. */
export async function demoRequest(method, path, { body, token, headers = {} } = {}) {
  await ready;
  const u = new URL(path, 'http://demo');
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const req = {
    method,
    url: `/api${path}`,
    path: `/api${u.pathname}`,
    query: Object.fromEntries(u.searchParams),
    body: body === undefined ? {} : clone(body),
    rawBody: body === undefined ? '' : JSON.stringify(body),
    headers: { ...lower, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ip: '127.0.0.1',
    protocol: location.protocol.replace(':', ''),
    get(h) {
      return h.toLowerCase() === 'host' ? location.host : this.headers[h.toLowerCase()];
    },
    on() {},
  };
  const result = await new Promise((resolve) => {
    const res = {
      statusCode: 200,
      headersSent: false,
      status(c) {
        this.statusCode = c;
        return this;
      },
      set() {
        return this;
      },
      setHeader() {},
      flushHeaders() {},
      write() {},
      json(v) {
        if (this.headersSent) return this;
        this.headersSent = true;
        resolve({ status: this.statusCode, data: clone(v) });
        return this;
      },
      send(v) {
        return this.json(v);
      },
      end() {
        return this.json({});
      },
    };
    app.handle(req, res, (err) => {
      if (res.headersSent) return;
      resolve(errorResponse(err || new HttpError(404, 'Rota não encontrada')));
    });
  });
  if (method !== 'GET' && result.status < 400) persistSoon();
  return result;
}

/** Fita ao vivo da catraca: o mesmo evento que o servidor mandaria por SSE. Devolve a função para cancelar. */
export async function openStream(token, onMessage) {
  await ready;
  const payload = verifyToken(token);
  const user = payload && one('SELECT gym_id FROM users WHERE id = ?', payload.uid);
  if (!user) return () => {};
  const ev = `gym:${user.gym_id}`;
  const send = (e) => onMessage(clone(e));
  accessBus.on(ev, send);
  return () => accessBus.off(ev, send);
}
