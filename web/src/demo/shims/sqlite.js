// node:sqlite (DatabaseSync) sobre o sql.js (SQLite compilado para WebAssembly).
// O sql.js precisa ser carregado antes de qualquer módulo da API: ver setSqlJs() em ../server.js.
let SQL = null;
let initial = null;
export let current = null;

export function setSqlJs(mod, bytes) {
  SQL = mod;
  initial = bytes || null;
}

const value = (v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v);

/** Parâmetros posicionais viram array; um objeto vira parâmetros nomeados aceitos com :, @ ou $. */
function params(args) {
  const [first] = args;
  if (args.length === 1 && first && typeof first === 'object' && !Array.isArray(first) && !(first instanceof Uint8Array)) {
    const o = {};
    for (const [k, v] of Object.entries(first)) {
      if (/^[:@$]/.test(k)) o[k] = value(v);
      else for (const p of [':', '@', '$']) o[p + k] = value(v);
    }
    return o;
  }
  return args.map(value);
}

class Statement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
  }
  #with(args, fn) {
    const st = this.db._db.prepare(this.sql);
    try {
      st.bind(params(args));
      return fn(st);
    } finally {
      st.free();
    }
  }
  get(...args) {
    return this.#with(args, (st) => (st.step() ? st.getAsObject() : undefined));
  }
  all(...args) {
    return this.#with(args, (st) => {
      const rows = [];
      while (st.step()) rows.push(st.getAsObject());
      return rows;
    });
  }
  run(...args) {
    this.#with(args, (st) => st.step());
    const changes = this.db._db.getRowsModified();
    const lastInsertRowid = this.db._db.exec('SELECT last_insert_rowid()')[0].values[0][0];
    return { changes, lastInsertRowid };
  }
}

export class DatabaseSync {
  constructor() {
    if (!SQL) throw new Error('sql.js não carregado');
    this._db = initial ? new SQL.Database(initial) : new SQL.Database();
    current = this;
  }
  exec(sql) {
    this._db.exec(sql);
    // sql.js não expõe sqlite3_get_autocommit; acompanha as transações abertas por exec().
    for (const st of String(sql).split(';')) {
      const s = st.trim().toUpperCase();
      if (/^BEGIN\b/.test(s)) this.#inTx = true;
      else if (/^(COMMIT|END)\b/.test(s) || /^ROLLBACK(\s+TRANSACTION)?$/.test(s)) this.#inTx = false;
    }
  }
  #inTx = false;
  get isTransaction() {
    return this.#inTx;
  }
  prepare(sql) {
    return new Statement(this, sql);
  }
  close() {}
  /** Fotografia binária do banco para guardar no IndexedDB. */
  export() {
    const data = this._db.export();
    this._db.exec('PRAGMA foreign_keys = ON;'); // export() reabre o banco e zera os pragmas
    return data;
  }
}

export default { DatabaseSync };
