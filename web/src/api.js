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

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token() ? { authorization: `Bearer ${token()}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token()) {
    setSession(null);
    window.location.href = '/entrar?expirou=1';
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const get = (p) => api(p);
export const post = (p, body) => api(p, { method: 'POST', body: body || {} });
export const put = (p, body) => api(p, { method: 'PUT', body });

export const streamUrl = () => `/api/access/stream?token=${encodeURIComponent(token() || '')}`;
