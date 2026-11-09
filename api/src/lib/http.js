export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}
export const bad = (msg, extra) => new HttpError(400, msg, extra);
export const notFound = (what = 'Registro') => new HttpError(404, `${what} não encontrado`);
export const forbidden = (msg = 'Seu perfil não tem permissão para esta ação') => new HttpError(403, msg);

/** Express 4 não captura erros de handlers async; isto encaminha para o error handler e responde JSON. */
export const h = (fn) => (req, res, next) => {
  try {
    const r = fn(req, res, next);
    if (r && typeof r.then === 'function') {
      r.then((v) => v !== undefined && !res.headersSent && res.json(v)).catch(next);
    } else if (r !== undefined && !res.headersSent) res.json(r);
  } catch (e) {
    next(e);
  }
};

export function requireFields(obj, fields) {
  const missing = fields.filter((f) => obj?.[f] === undefined || obj[f] === null || obj[f] === '');
  if (missing.length) throw bad(`Campos obrigatórios: ${missing.join(', ')}`);
}

export const int = (v, def) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
};
