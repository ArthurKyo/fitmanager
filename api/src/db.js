import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.FM_DB || path.join(here, '..', 'fitmanager.db');

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

// Valores monetários sempre em centavos (INTEGER). Datas no fuso da academia
// como texto 'YYYY-MM-DD' / 'YYYY-MM-DD HH:MM:SS' (ordenáveis lexicograficamente).
db.exec(`
CREATE TABLE IF NOT EXISTS gyms (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  cnpj TEXT,
  phone TEXT,
  address TEXT,
  pix_key TEXT,
  pix_merchant TEXT,
  pix_city TEXT,
  overdue_tolerance_days INTEGER NOT NULL DEFAULT 5,
  require_medical INTEGER NOT NULL DEFAULT 1,
  max_capacity INTEGER NOT NULL DEFAULT 120,
  antipassback_minutes INTEGER NOT NULL DEFAULT 240,
  open_hour INTEGER NOT NULL DEFAULT 5,
  close_hour INTEGER NOT NULL DEFAULT 23,
  saas_plan TEXT NOT NULL DEFAULT 'essencial',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY,
  gym_id INTEGER NOT NULL REFERENCES gyms(id),
  name TEXT NOT NULL,
  cpf TEXT NOT NULL,
  birth_date TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  gender TEXT,
  guardian_name TEXT,
  guardian_cpf TEXT,
  medical_valid_until TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','inativo')),
  source TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (gym_id, cpf)
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  gym_id INTEGER NOT NULL REFERENCES gyms(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('dono','recepcao','professor','aluno')),
  member_id INTEGER REFERENCES members(id),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS credentials (
  id INTEGER PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('digital','facial','cartao')),
  label TEXT,
  enrolled_at TEXT NOT NULL,
  UNIQUE (member_id, kind, label)
);

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY,
  gym_id INTEGER NOT NULL REFERENCES gyms(id),
  name TEXT NOT NULL,
  months INTEGER NOT NULL CHECK (months >= 1),
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  upfront INTEGER NOT NULL DEFAULT 0,
  enrollment_fee_cents INTEGER NOT NULL DEFAULT 0,
  fidelity INTEGER NOT NULL DEFAULT 0,
  cancel_fine_pct INTEGER NOT NULL DEFAULT 0,
  max_daily_entries INTEGER NOT NULL DEFAULT 2,
  hour_start INTEGER NOT NULL DEFAULT 0,
  hour_end INTEGER NOT NULL DEFAULT 24,
  weekdays TEXT NOT NULL DEFAULT '0123456',
  freeze_days INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY,
  gym_id INTEGER NOT NULL REFERENCES gyms(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  plan_id INTEGER NOT NULL REFERENCES plans(id),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  due_day INTEGER NOT NULL CHECK (due_day BETWEEN 1 AND 28),
  monthly_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','cancelado','encerrado')),
  freeze_used_days INTEGER NOT NULL DEFAULT 0,
  cancelled_at TEXT,
  cancel_reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS freezes (
  id INTEGER PRIMARY KEY,
  contract_id INTEGER NOT NULL REFERENCES contracts(id),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY,
  gym_id INTEGER NOT NULL REFERENCES gyms(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  contract_id INTEGER REFERENCES contracts(id),
  kind TEXT NOT NULL CHECK (kind IN ('mensalidade','matricula','multa','avulso')),
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','pago','cancelado')),
  paid_at TEXT,
  paid_cents INTEGER,
  method TEXT,
  txid TEXT UNIQUE,
  received_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY,
  gym_id INTEGER NOT NULL REFERENCES gyms(id),
  name TEXT NOT NULL,
  vendor TEXT NOT NULL CHECK (vendor IN ('controlid','simulador')),
  host TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('entrada','saida','ambos')),
  token TEXT NOT NULL UNIQUE,
  last_seen TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS device_commands (
  id INTEGER PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES devices(id),
  action TEXT NOT NULL,
  payload TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  done_at TEXT
);

CREATE TABLE IF NOT EXISTS access_logs (
  id INTEGER PRIMARY KEY,
  gym_id INTEGER NOT NULL REFERENCES gyms(id),
  member_id INTEGER REFERENCES members(id),
  device_id INTEGER REFERENCES devices(id),
  method TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('entrada','saida')),
  granted INTEGER NOT NULL,
  code TEXT NOT NULL,
  message TEXT,
  operator_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_access_gym_time ON access_logs (gym_id, created_at);
CREATE INDEX IF NOT EXISTS idx_access_member ON access_logs (member_id, created_at);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY,
  gym_id INTEGER NOT NULL REFERENCES gyms(id),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  source TEXT,
  stage TEXT NOT NULL DEFAULT 'novo' CHECK (stage IN ('novo','contato','visita','experimental','negociacao','matriculado','perdido')),
  interest_plan_id INTEGER REFERENCES plans(id),
  next_contact TEXT,
  lost_reason TEXT,
  member_id INTEGER REFERENCES members(id),
  owner_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lead_events (
  id INTEGER PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  kind TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exercises (
  id INTEGER PRIMARY KEY,
  gym_id INTEGER REFERENCES gyms(id),
  name TEXT NOT NULL,
  muscle TEXT NOT NULL,
  equipment TEXT
);

CREATE TABLE IF NOT EXISTS workouts (
  id INTEGER PRIMARY KEY,
  gym_id INTEGER NOT NULL REFERENCES gyms(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  name TEXT NOT NULL,
  goal TEXT,
  valid_until TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workout_items (
  id INTEGER PRIMARY KEY,
  workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  division TEXT NOT NULL,
  position INTEGER NOT NULL,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id),
  sets INTEGER NOT NULL,
  reps TEXT NOT NULL,
  load_kg REAL,
  rest_sec INTEGER NOT NULL DEFAULT 60,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS workout_sessions (
  id INTEGER PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id),
  workout_id INTEGER NOT NULL REFERENCES workouts(id),
  division TEXT NOT NULL,
  done_at TEXT NOT NULL,
  duration_min INTEGER,
  effort INTEGER
);

CREATE TABLE IF NOT EXISTS diets (
  id INTEGER PRIMARY KEY,
  gym_id INTEGER NOT NULL REFERENCES gyms(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  name TEXT NOT NULL,
  kcal_target INTEGER,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS diet_meals (
  id INTEGER PRIMARY KEY,
  diet_id INTEGER NOT NULL REFERENCES diets(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  time TEXT
);

CREATE TABLE IF NOT EXISTS diet_items (
  id INTEGER PRIMARY KEY,
  meal_id INTEGER NOT NULL REFERENCES diet_meals(id) ON DELETE CASCADE,
  food TEXT NOT NULL,
  qty TEXT NOT NULL,
  kcal INTEGER NOT NULL DEFAULT 0,
  protein_g REAL NOT NULL DEFAULT 0,
  carbs_g REAL NOT NULL DEFAULT 0,
  fat_g REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  gym_id INTEGER NOT NULL,
  user_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id INTEGER,
  detail TEXT,
  created_at TEXT NOT NULL
);
`);

/** Executa fn dentro de uma transação; desfaz tudo se lançar erro. */
// ---------- Pagamentos via gateway ----------
db.exec(`
CREATE TABLE IF NOT EXISTS payment_profiles (
  member_id INTEGER PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  gym_id INTEGER NOT NULL REFERENCES gyms(id),
  provider TEXT NOT NULL,
  customer_id TEXT,
  card_token TEXT,
  card_brand TEXT,
  card_last4 TEXT,
  autopay INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gateway_charges (
  id INTEGER PRIMARY KEY,
  gym_id INTEGER NOT NULL REFERENCES gyms(id),
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  provider TEXT NOT NULL,
  gateway_id TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('pix','boleto','cartao')),
  origin TEXT NOT NULL DEFAULT 'app' CHECK (origin IN ('app','recepcao','autopay')),
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','pago','cancelado','falhou','estornado')),
  amount_cents INTEGER NOT NULL,
  net_cents INTEGER,
  platform_fee_cents INTEGER NOT NULL DEFAULT 0,
  recovered INTEGER NOT NULL DEFAULT 0,
  pix_payload TEXT,
  invoice_url TEXT,
  boleto_url TEXT,
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  paid_at TEXT,
  UNIQUE (provider, gateway_id)
);
CREATE INDEX IF NOT EXISTS idx_gc_invoice ON gateway_charges (invoice_id);

CREATE TABLE IF NOT EXISTS webhook_events (
  id INTEGER PRIMARY KEY,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  gym_id INTEGER,
  event TEXT,
  payload TEXT,
  result TEXT,
  received_at TEXT NOT NULL,
  UNIQUE (provider, event_id)
);
`);

function addColumn(table, col, def) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
// manual = recepção confirma; simulado = gateway de testes local; asaas = cobrança real
addColumn('gyms', 'pay_provider', "TEXT NOT NULL DEFAULT 'manual'");
addColumn('gyms', 'pay_env', "TEXT NOT NULL DEFAULT 'sandbox'");
addColumn('gyms', 'pay_api_key_enc', 'TEXT');
addColumn('gyms', 'pay_webhook_token', 'TEXT');
addColumn('gyms', 'pay_connected_at', 'TEXT');

// ---------- App do aluno: perfil físico, cardio e compartilhamento ----------
addColumn('gyms', 'instagram', 'TEXT');
addColumn('members', 'weight_kg', 'REAL');
addColumn('members', 'height_cm', 'INTEGER');
addColumn('members', 'instagram', 'TEXT');
addColumn('exercises', 'video_url', 'TEXT');
db.exec(`
CREATE TABLE IF NOT EXISTS cardio_sessions (
  id INTEGER PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('corrida','caminhada','bike','esteira','eliptico','escada','remo')),
  mode TEXT NOT NULL CHECK (mode IN ('gps','manual')),
  distance_m INTEGER NOT NULL DEFAULT 0,
  duration_s INTEGER NOT NULL,
  kcal INTEGER,
  avg_pace_s_km INTEGER,
  elevation_m INTEGER,
  route TEXT,
  started_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cardio_member ON cardio_sessions (member_id, started_at);

CREATE TABLE IF NOT EXISTS shares (
  id INTEGER PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  gym_id INTEGER NOT NULL REFERENCES gyms(id),
  kind TEXT NOT NULL,
  ref_id INTEGER,
  created_at TEXT NOT NULL
);
`);

let depth = 0;
export function tx(fn) {
  // Aninhável: dentro de outra transação vira SAVEPOINT.
  const nested = depth > 0 || db.isTransaction;
  const sp = `sp${depth}`;
  db.exec(nested ? `SAVEPOINT ${sp}` : 'BEGIN');
  depth++;
  try {
    const r = fn();
    db.exec(nested ? `RELEASE ${sp}` : 'COMMIT');
    return r;
  } catch (e) {
    db.exec(nested ? `ROLLBACK TO ${sp}; RELEASE ${sp}` : 'ROLLBACK');
    throw e;
  } finally {
    depth--;
  }
}

export const one = (sql, ...p) => db.prepare(sql).get(...p);
export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);
