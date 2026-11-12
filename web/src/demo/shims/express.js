// Roteador compatível com o subconjunto de Express usado pela API: Router(), use(), get/post/put/patch/delete,
// parâmetros ":id", middlewares encadeados e erros via next(err).
function compile(path) {
  const keys = [];
  const src = path.replace(/\/:(\w+)/g, (_, k) => (keys.push(k), '/([^/]+)'));
  return { re: new RegExp(`^${src}/?$`), keys };
}

const under = (path, prefix) => prefix === '/' || path === prefix || path.startsWith(`${prefix}/`);

class Router {
  constructor() {
    this.stack = [];
  }
  use(...args) {
    const prefix = typeof args[0] === 'string' ? args.shift() : '/';
    for (const fn of args.flat()) this.stack.push({ kind: 'use', prefix: prefix.replace(/\/$/, '') || '/', fn });
    return this;
  }
  #route(method, path, fns) {
    this.stack.push({ kind: 'route', method, ...compile(path), fns: fns.flat() });
    return this;
  }
  get(p, ...f) {
    return this.#route('GET', p, f);
  }
  post(p, ...f) {
    return this.#route('POST', p, f);
  }
  put(p, ...f) {
    return this.#route('PUT', p, f);
  }
  patch(p, ...f) {
    return this.#route('PATCH', p, f);
  }
  delete(p, ...f) {
    return this.#route('DELETE', p, f);
  }

  handle(req, res, done) {
    const path = req.path;
    let i = 0;
    const next = (err) => {
      if (err) return done(err);
      if (res.headersSent) return undefined;
      const layer = this.stack[i++];
      if (!layer) return done();
      try {
        if (layer.kind === 'use') {
          if (!under(path, layer.prefix)) return next();
          if (layer.fn instanceof Router) {
            const sub = layer.prefix === '/' ? path : path.slice(layer.prefix.length) || '/';
            req.path = sub;
            return layer.fn.handle(req, res, (e) => {
              req.path = path;
              next(e);
            });
          }
          return layer.fn(req, res, next);
        }
        if (layer.method !== req.method) return next();
        const m = layer.re.exec(path);
        if (!m) return next();
        req.params = Object.fromEntries(layer.keys.map((k, n) => [k, decodeURIComponent(m[n + 1])]));
        let j = 0;
        const step = (e) => {
          if (e) return done(e);
          const fn = layer.fns[j++];
          if (!fn) return next();
          try {
            return fn(req, res, step);
          } catch (ex) {
            return done(ex);
          }
        };
        return step();
      } catch (ex) {
        return done(ex);
      }
    };
    next();
  }
}

export function RouterFactory() {
  return new Router();
}
export { RouterFactory as Router };

const express = () => new Router();
express.Router = RouterFactory;
express.json = () => (_req, _res, next) => next();
export default express;
