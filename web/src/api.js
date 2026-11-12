const KEY = 'fm.session';

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || null;
  } catch {
    return null;
  }
}
export function setSession(s) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* modo privado: sessão só em memória */
  }
  memory = s;
}
let memory = null;
const token = () => getSession()?.token || memory?.token;

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || 'Falha na comunicação com o servidor');
    this.status = status;
    this.body = body;
  }
}

/** Demonstração estática (GitHub Pages): a API roda no navegador. Ver src/demo/server.js. */
export const DEMO = __FM_DEMO__;
/** Prefixo do site ('' em produção normal, '/fitmanager' no GitHub Pages). */
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
/** Caminho absoluto de um arquivo de public/ respeitando o prefixo do site. */
export const asset = (p) => (typeof p === 'string' && p.startsWith('/') ? BASE + p : p);
const demoServer = () => import('./demo/server.js');

export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  let status;
  let data;
  if (__FM_DEMO__) {
    ({ status, data } = await (await demoServer()).demoRequest(method, path, { body, token: token(), headers }));
  } else {
    const res = await fetch(`/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token() ? { authorization: `Bearer ${token()}` } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    status = res.status;
    data = await res.json().catch(() => ({}));
  }
  if (status === 401 && token() && !headers['x-platform-key']) {
    setSession(null);
    window.location.href = `${BASE}/entrar?expirou=1`;
  }
  if (status < 200 || status >= 300) throw new ApiError(status, data);
  return data;
}

export const get = (p) => api(p);
export const post = (p, body) => api(p, { method: 'POST', body: body || {} });
export const put = (p, body) => api(p, { method: 'PUT', body });

export const streamUrl = () => `/api/access/stream?token=${encodeURIComponent(token() || '')}`;

/** Fita ao vivo da catraca. Devolve a função que encerra a assinatura. */
export function openStream(onMessage, onState) {
  if (__FM_DEMO__) {
    let stop = () => {};
    let closed = false;
    demoServer()
      .then((m) => m.openStream(token(), onMessage))
      .then((off) => {
        if (closed) off();
        else (stop = off), onState(true);
      });
    return () => {
      closed = true;
      stop();
    };
  }
  const es = new EventSource(streamUrl());
  es.onopen = () => onState(true);
  es.onerror = () => onState(false);
  es.onmessage = (m) => onMessage(JSON.parse(m.data));
  return () => es.close();
}

// Na demonstração, começa a montar o banco assim que o site abre, para o login ser imediato.
if (__FM_DEMO__) demoServer();
