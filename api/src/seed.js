import './lib/time.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Recria o banco do zero.
const dbFile = process.env.FM_DB || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fitmanager.db');
for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) if (fs.existsSync(f)) fs.unlinkSync(f);

const { db, one, all, run } = await import('./db.js');
const { hashPassword, randomToken } = await import('./lib/auth.js');
const { fakeCPF } = await import('./lib/cpf.js');
const { today, now, addDays, addMonths, dateStr, dateTimeStr, parseDate, diffDays } = await import('./lib/time.js');
const { createContract, closeExpiredContracts, charges } = await import('./domain/billing.js');
const { evaluateAccess, recordAccess } = await import('./domain/access.js');

// PRNG determinístico: o mesmo seed gera sempre a mesma academia.
let s = 20261108;
const rand = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (a) => a[Math.floor(rand() * a.length)];
const between = (a, b) => a + Math.floor(rand() * (b - a + 1));
const chance = (p) => rand() < p;

const T = today();
const stamp = (d, h = 10, m = 0) => `${d} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;

db.exec('BEGIN');

const gymId = run(
  `INSERT INTO gyms (name, slug, cnpj, phone, address, pix_key, pix_merchant, pix_city, overdue_tolerance_days, require_medical, max_capacity, antipassback_minutes, open_hour, close_hour, saas_plan, created_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  'Academia Contrapeso',
  'contrapeso',
  '41.873.206/0001-55',
  '(11) 3816-2240',
  'Rua Cardeal Arcoverde, 1749, Pinheiros, São Paulo',
  'financeiro@contrapeso.com.br',
  'Academia Contrapeso',
  'Sao Paulo',
  5,
  1,
  110,
  240,
  5,
  23,
  'performance',
  stamp(addMonths(T, -15))
).lastInsertRowid;

const pw = hashPassword('fitmanager123');
const addUser = (name, email, role, memberId = null) =>
  run(`INSERT INTO users (gym_id, name, email, password_hash, role, member_id, created_at) VALUES (?,?,?,?,?,?,?)`, gymId, name, email, pw, role, memberId, now()).lastInsertRowid;
const owner = addUser('Renato Galvão', 'dono@contrapeso.com.br', 'dono');
const reception = addUser('Patrícia Moura', 'recepcao@contrapeso.com.br', 'recepcao');
const coach = addUser('Diego Sant’Anna', 'professor@contrapeso.com.br', 'professor');
addUser('Bianca Lopes', 'bianca.lopes@contrapeso.com.br', 'professor');

// ---------- Planos ----------
const P = (name, months, price, o = {}) =>
  run(
    `INSERT INTO plans (gym_id, name, months, price_cents, upfront, enrollment_fee_cents, fidelity, cancel_fine_pct, max_daily_entries, hour_start, hour_end, weekdays, freeze_days)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    gymId,
    name,
    months,
    price,
    o.upfront ?? 0,
    o.fee ?? 0,
    o.fidelity ?? 0,
    o.fine ?? 0,
    o.daily ?? 2,
    o.hs ?? 0,
    o.he ?? 24,
    o.wd ?? '0123456',
    o.freeze ?? 0
  ).lastInsertRowid;
const plans = {
  mensal: P('Mensal livre', 1, 15990, { fee: 6000 }),
  trimestral: P('Trimestral', 3, 13990, { fee: 6000, freeze: 15 }),
  anual: P('Anual fidelidade', 12, 10990, { fidelity: 1, fine: 30, freeze: 30 }),
  avista: P('Anual à vista', 12, 9490, { upfront: 1, freeze: 30 }),
  diurno: P('Diurno seg a sex', 1, 9990, { fee: 6000, hs: 6, he: 16, wd: '12345', daily: 1 }),
};
const planMix = [...Array(30).fill('anual'), ...Array(25).fill('mensal'), ...Array(18).fill('trimestral'), ...Array(12).fill('avista'), ...Array(15).fill('diurno')];

// ---------- Catracas ----------
const D = (name, vendor, host, dir) => run('INSERT INTO devices (gym_id, name, vendor, host, direction, token) VALUES (?,?,?,?,?,?)', gymId, name, vendor, host, dir, randomToken()).lastInsertRowid;
const dIn = D('Catraca 1, entrada', 'controlid', '192.168.0.50', 'entrada');
const dOut = D('Catraca 2, saída', 'controlid', '192.168.0.51', 'saida');
D('Simulador da recepção', 'simulador', null, 'ambos');
const devIn = one('SELECT * FROM devices WHERE id = ?', dIn);
const devOut = one('SELECT * FROM devices WHERE id = ?', dOut);

// ---------- Alunos ----------
const firstF = ['Ana', 'Beatriz', 'Camila', 'Débora', 'Fernanda', 'Gabriela', 'Helena', 'Isabela', 'Júlia', 'Larissa', 'Letícia', 'Luana', 'Marina', 'Natália', 'Patrícia', 'Raquel', 'Renata', 'Sofia', 'Tatiane', 'Vanessa', 'Yasmin', 'Carolina', 'Aline', 'Bruna', 'Priscila', 'Lívia', 'Elaine', 'Thaís'];
const firstM = ['André', 'Bruno', 'Caio', 'Daniel', 'Eduardo', 'Felipe', 'Gustavo', 'Henrique', 'Igor', 'João', 'Leonardo', 'Lucas', 'Marcelo', 'Matheus', 'Otávio', 'Paulo', 'Rafael', 'Rodrigo', 'Samuel', 'Thiago', 'Vinícius', 'Wagner', 'Fábio', 'Murilo', 'Diego', 'César', 'Hugo', 'Ícaro'];
const lasts = ['Almeida', 'Barbosa', 'Cardoso', 'Carvalho', 'Castro', 'Correia', 'Costa', 'Dias', 'Duarte', 'Fernandes', 'Ferreira', 'Freitas', 'Gomes', 'Lima', 'Machado', 'Martins', 'Melo', 'Mendes', 'Monteiro', 'Moreira', 'Nascimento', 'Nunes', 'Oliveira', 'Pereira', 'Pinto', 'Ramos', 'Ribeiro', 'Rocha', 'Santos', 'Siqueira', 'Soares', 'Souza', 'Teixeira', 'Vieira', 'Azevedo', 'Brandão', 'Coelho', 'Queiroz', 'Tavares', 'Prado'];
const sources = ['indicacao', 'instagram', 'google', 'passou_na_frente', 'gympass', 'site', 'balcao'];

const members = [];
function addMember(o) {
  const female = o.female ?? chance(0.52);
  const l1 = pick(lasts);
  let l2 = pick(lasts);
  while (l2 === l1) l2 = pick(lasts);
  const name = o.name || `${pick(female ? firstF : firstM)} ${l1} ${l2}`;
  const ageY = o.age ?? (chance(0.06) ? between(15, 17) : between(18, 62));
  const birth = dateStr(new Date(parseDate(T).getFullYear() - ageY, between(0, 11), between(1, 28), 12));
  const created = o.created || addDays(T, -between(5, 430));
  const minor = ageY < 18;
  const id = run(
    `INSERT INTO members (gym_id, name, cpf, birth_date, phone, email, gender, guardian_name, guardian_cpf, medical_valid_until, source, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    gymId,
    name,
    fakeCPF(rand),
    o.birth || birth,
    `119${between(10000000, 99999999)}`,
    o.email || `${name.split(' ')[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}.${between(10, 99)}@email.com`,
    female ? 'F' : 'M',
    minor ? `${pick(female ? firstF : firstM)} ${name.split(' ').slice(-1)[0]}` : null,
    minor ? fakeCPF(rand) : null,
    o.medical ?? (chance(0.05) ? addDays(T, -between(3, 60)) : addDays(created, 365 + between(0, 30)) > T ? addDays(created, 365) : addDays(T, between(30, 300))),
    o.source || pick(sources),
    stamp(created, between(7, 20), between(0, 59))
  ).lastInsertRowid;
  run('INSERT INTO credentials (member_id, kind, label, enrolled_at) VALUES (?,?,?,?)', id, chance(0.6) ? 'digital' : 'facial', chance(0.6) ? 'Indicador direito' : 'Face', stamp(created));
  const m = {
    id,
    name,
    created,
    plan: o.plan || pick(planMix),
    loyal: o.loyal ?? chance(0.78),
    debtor: o.debtor ?? chance(0.07),
    freq: o.freq ?? pick([1, 2, 3, 3, 3, 4, 4, 5, 5, 6]),
    slot: o.slot || pick(['manha', 'manha', 'almoco', 'tarde', 'noite', 'noite', 'noite', 'noite']),
    vanishedDaysAgo: o.vanished ?? (chance(0.09) ? between(11, 26) : null),
    cancel: o.cancel ?? chance(0.08),
  };
  members.push(m);
  return m;
}

// Personagens fixos da demonstração
const mariana = addMember({ name: 'Mariana Albuquerque Reis', female: true, age: 29, plan: 'anual', created: addDays(T, -200), loyal: true, debtor: false, freq: 5, slot: 'noite', vanished: null, cancel: false, email: 'aluno@contrapeso.com.br', source: 'instagram' });
const rafael = addMember({ name: 'Rafael Teixeira Duarte', female: false, age: 34, plan: 'mensal', created: addDays(T, -140), loyal: true, debtor: false, freq: 4, slot: 'noite', vanished: null, cancel: false });
const helena = addMember({ name: 'Helena Prado Castro', female: true, age: 41, plan: 'trimestral', created: addDays(T, -60), loyal: true, debtor: false, freq: 3, slot: 'manha', vanished: null, cancel: false, medical: addDays(T, -12) });
for (let i = 0; i < 147; i++) addMember({});

const methods = ['pix', 'pix', 'pix', 'pix', 'cartao_credito', 'cartao_credito', 'cartao_debito', 'dinheiro'];

for (const m of members) {
  const rec = one('SELECT * FROM members WHERE id = ?', m.id);
  // matrícula + renovações até hoje
  let c = createContract({ gymId, memberId: m.id, planId: plans[m.plan], startDate: m.created, dueDay: Number(m.created.slice(8, 10)) > 28 ? 28 : Number(m.created.slice(8, 10)), createdAt: rec.created_at });
  while (c.end_date < T && (m.loyal || chance(0.35))) {
    const nextPlan = chance(0.15) ? plans[pick(planMix)] : c.plan_id;
    c = createContract({ gymId, memberId: m.id, planId: nextPlan, startDate: addDays(c.end_date, 1), dueDay: c.due_day, createdAt: stamp(addDays(c.end_date, -2)) });
  }
  m.contract = c;

  // cancelamentos passados
  if (m.cancel && c.end_date > T && c.start_date < addDays(T, -20) && m !== mariana) {
    const at = addDays(T, -between(3, 120));
    if (at > c.start_date) {
      run(`UPDATE invoices SET status='cancelado' WHERE contract_id = ? AND status='pendente' AND due_date > ?`, c.id, at);
      run(`UPDATE contracts SET status='cancelado', cancelled_at = ?, cancel_reason = ?, end_date = ? WHERE id = ?`, stamp(at, 15), pick(['Mudou de cidade', 'Questões financeiras', 'Lesão / recomendação médica', 'Falta de tempo', 'Foi para academia concorrente', 'Insatisfeito com lotação no horário']), at, c.id);
      m.cancelledAt = at;
    }
  }

  // pagamentos
  const invs = all(`SELECT * FROM invoices WHERE member_id = ? AND status = 'pendente' AND due_date <= ? ORDER BY due_date`, m.id, T);
  invs.forEach((inv, idx) => {
    const isLast = idx >= invs.length - (m.debtor ? between(1, 2) : 0);
    const dueToday = inv.due_date === T;
    if ((m.debtor && isLast && inv.due_date < addDays(T, -1)) || (dueToday && chance(0.7)) || (inv.due_date >= addDays(T, -3) && chance(0.35))) return;
    const late = chance(0.18) ? between(1, 9) : chance(0.5) ? -between(0, 4) : 0;
    const paidDay = addDays(inv.due_date, late) > T ? T : addDays(inv.due_date, late);
    const total = charges(inv, paidDay).total;
    run(`UPDATE invoices SET status='pago', paid_at = ?, paid_cents = ?, method = ?, received_by = ? WHERE id = ?`, stamp(paidDay, between(7, 21), between(0, 59)), total, pick(methods), chance(0.5) ? reception : null, inv.id);
  });
}

// ---------- Pagamentos online (gateway simulado) ----------
// A academia demo recebe por Pix/cartão/boleto com baixa automática. ~35% dos alunos em débito automático.
run(`UPDATE gyms SET pay_provider = 'simulado', pay_connected_at = ?, instagram = 'academiacontrapeso' WHERE id = ?`, stamp(addMonths(T, -7)), gymId);
run('UPDATE members SET weight_kg = 63.5, height_cm = 168, instagram = ? WHERE id = ?', 'mari.reis', mariana.id);
for (const m of members.slice(3, 80)) run('UPDATE members SET weight_kg = ? WHERE id = ?', between(52, 98) + 0.5 * between(0, 1), m.id);
// cardio: Mariana corre 2x por semana no parque, mais esteira depois do treino
for (let w = 0; w < 6; w++) {
  for (const dow of [2, 6]) {
    const d = addDays(T, -(w * 7 + ((parseDate(T).getDay() - dow + 7) % 7)));
    if (d > T || d < mariana.created) continue;
    const dist = between(4200, 6300);
    const dur = Math.round(dist * (between(330, 380) / 1000));
    run(
      'INSERT INTO cardio_sessions (member_id, kind, mode, distance_m, duration_s, kcal, avg_pace_s_km, elevation_m, started_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      mariana.id, 'corrida', 'gps', dist, dur, Math.round(9.8 * 63.5 * (dur / 3600)), Math.round(dur / (dist / 1000)), between(18, 45), stamp(d, 6, between(30, 59)), stamp(d, 7)
    );
  }
}
run('INSERT INTO shares (member_id, gym_id, kind, created_at) VALUES (?,?,?,?)', mariana.id, gymId, 'cardio', stamp(addDays(T, -9), 7));
const { platformFee } = await import('./payments/service.js');
const autopayMembers = new Set();
for (const m of members) {
  const auto = m !== mariana && m !== rafael && chance(0.35);
  if (auto) autopayMembers.add(m.id);
  run(
    'INSERT INTO payment_profiles (member_id, gym_id, provider, customer_id, card_token, card_brand, card_last4, autopay, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
    m.id, gymId, 'simulado', `cus_${m.id}`, auto ? `simtok_ok_${m.id}` : null, auto ? pick(['VISA', 'MASTERCARD', 'ELO']) : null, auto ? String(between(1000, 9999)) : null, auto ? 1 : 0, now()
  );
}
const since = addMonths(T, -7);
for (const inv of all(`SELECT * FROM invoices WHERE gym_id = ? AND status = 'pago' AND paid_at >= ?`, gymId, since)) {
  const auto = autopayMembers.has(inv.member_id);
  let method = inv.method;
  if (auto) method = 'cartao_credito';
  else if (inv.method === 'dinheiro' || inv.method === 'cartao_debito' || !chance(0.8)) continue; // pago no balcão
  if (auto && inv.method !== 'cartao_credito') run(`UPDATE invoices SET method = 'cartao_credito' WHERE id = ?`, inv.id);
  const gm = method === 'pix' ? 'pix' : 'cartao';
  run(
    `INSERT INTO gateway_charges (gym_id, invoice_id, provider, gateway_id, method, origin, status, amount_cents, net_cents, platform_fee_cents, recovered, created_at, paid_at)
     VALUES (?,?,?,?,?,?, 'pago', ?,?,?,?,?,?)`,
    gymId, inv.id, 'simulado', `pay_seed_${inv.id}`, gm, auto ? 'autopay' : 'app', inv.paid_cents,
    inv.paid_cents - (gm === 'pix' ? 99 : Math.round(inv.paid_cents * 0.0299) + 49), platformFee(inv.paid_cents),
    inv.paid_at.slice(0, 10) > inv.due_date ? 1 : 0, inv.paid_at, inv.paid_at
  );
}

// Rafael: garante a mensalidade vencida há 12 dias (bloqueado na catraca)
{
  run(`UPDATE invoices SET status='pago', paid_at = due_date || ' 19:40:00', paid_cents = amount_cents, method='cartao_debito' WHERE member_id = ? AND status='pendente' AND due_date < ?`, rafael.id, T);
  const last = one(`SELECT id FROM invoices WHERE member_id = ? AND status != 'cancelado' AND due_date < ? ORDER BY due_date DESC LIMIT 1`, rafael.id, T);
  if (last) run(`UPDATE invoices SET status='pendente', paid_at=NULL, paid_cents=NULL, method=NULL, due_date = ? WHERE id = ?`, addDays(T, -12), last.id);
}
// Mariana: tudo pago até hoje, próxima parcela em 3 dias
run(`UPDATE invoices SET status='pago', paid_at = due_date || ' 08:12:00', paid_cents = amount_cents, method='pix' WHERE member_id = ? AND status='pendente' AND due_date <= ?`, mariana.id, T);
{
  const next = one(`SELECT id FROM invoices WHERE member_id = ? AND status='pendente' ORDER BY due_date LIMIT 1`, mariana.id);
  if (next) run('UPDATE invoices SET due_date = ? WHERE id = ?', addDays(T, 3), next.id);
}

// Trancamentos em curso
for (const m of members.filter((x) => ['anual', 'avista', 'trimestral'].includes(x.plan) && !x.debtor && !x.cancelledAt && x.contract.end_date > addDays(T, 40)).slice(5, 8)) {
  const start = addDays(T, -between(2, 8));
  const days = 15;
  run('INSERT INTO freezes (contract_id, start_date, end_date, reason, created_at) VALUES (?,?,?,?,?)', m.contract.id, start, addDays(start, days - 1), pick(['Viagem a trabalho', 'Cirurgia no joelho', 'Férias']), stamp(start));
  run('UPDATE contracts SET end_date = ?, freeze_used_days = ? WHERE id = ?', addDays(m.contract.end_date, days), days, m.contract.id);
  m.frozen = { start, end: addDays(start, days - 1) };
}

// ---------- Catraca: 5 semanas de passagens geradas pelo motor de regras ----------
const gym = one('SELECT * FROM gyms WHERE id = ?', gymId);
const slotHour = { manha: [6, 9], almoco: [11, 13], tarde: [14, 16], noite: [17, 21] };
const nowDate = new Date();
const events = [];
for (let back = 35; back >= 0; back--) {
  const day = addDays(T, -back);
  const wd = parseDate(day).getDay();
  for (const m of members) {
    if (day < m.created) continue;
    if (m.vanishedDaysAgo && back < m.vanishedDaysAgo) continue;
    if (m.cancelledAt && day > m.cancelledAt) continue;
    const weekendFactor = wd === 0 ? 0.25 : wd === 6 ? 0.5 : wd === 5 ? 0.85 : 1.08;
    if (!chance((m.freq / 6) * weekendFactor)) continue;
    let [h1, h2] = slotHour[m.slot];
    if (m.plan === 'diurno') [h1, h2] = [6, 15];
    if (wd === 0 || wd === 6) [h1, h2] = [8, 12];
    const hh = between(h1, h2);
    const at = new Date(parseDate(day).setHours(hh, between(0, 59), between(0, 59)));
    if (at > nowDate) continue;
    events.push({ m, at });
  }
}
// alguns teimosos: Rafael tenta entrar mesmo bloqueado; Helena com atestado vencido
for (let back = 0; back < 6; back++) {
  const d = addDays(T, -back);
  const a = new Date(parseDate(d).setHours(19, between(0, 40), 0));
  if (a < nowDate) events.push({ m: rafael, at: a, retry: true });
  const b = new Date(parseDate(d).setHours(7, between(0, 30), 0));
  if (b < nowDate && back % 2 === 0) events.push({ m: helena, at: b });
}
events.sort((a, b) => a.at - b.at);

const methodFor = () => pick(['digital', 'digital', 'digital', 'facial', 'facial', 'qrcode']);
const exitsPending = [];
for (const e of events) {
  // registra saídas que já deveriam ter acontecido
  while (exitsPending.length && exitsPending[0].at <= e.at) {
    const x = exitsPending.shift();
    recordAccess({ gym, device: devOut, memberId: x.m.id, method: x.method, direction: 'saida', decision: evaluateAccess({ gym, memberId: x.m.id, direction: 'saida', at: x.at }), at: x.at });
  }
  const method = methodFor();
  const decision = evaluateAccess({ gym, memberId: e.m.id, direction: 'entrada', at: e.at });
  // gente de verdade desiste depois de ser barrada umas vezes e vai resolver na recepção
  if (!decision.granted) {
    e.m.denied = (e.m.denied || 0) + 1;
    if (e.m.denied > 2 && !e.retry) continue;
  } else e.m.denied = 0;
  recordAccess({ gym, device: devIn, memberId: e.m.id, method, direction: 'entrada', decision, at: e.at });
  if (decision.granted) {
    const out = new Date(e.at.getTime() + between(45, 95) * 60_000);
    if (out < nowDate && !chance(0.02)) {
      exitsPending.push({ m: e.m, at: out, method });
      exitsPending.sort((a, b) => a.at - b.at);
    }
  }
}
for (const x of exitsPending) recordAccess({ gym, device: devOut, memberId: x.m.id, method: x.method, direction: 'saida', decision: evaluateAccess({ gym, memberId: x.m.id, direction: 'saida', at: x.at }), at: x.at });
// tentativa de quem não é aluno
recordAccess({ gym, device: devIn, memberId: null, method: 'facial', direction: 'entrada', decision: evaluateAccess({ gym, memberId: null }), at: new Date(nowDate.getTime() - 40 * 60_000) });

closeExpiredContracts();

// esteira depois da musculação: só nos dias em que passou na catraca
for (const r of all(`SELECT DISTINCT substr(created_at,1,10) AS d FROM access_logs WHERE member_id = ? AND granted = 1 AND direction='entrada' AND created_at >= ?`, mariana.id, addDays(T, -21))) {
  if (chance(0.6)) run('INSERT INTO cardio_sessions (member_id, kind, mode, distance_m, duration_s, kcal, avg_pace_s_km, started_at, created_at) VALUES (?,?,?,?,?,?,?,?,?)', mariana.id, 'esteira', 'manual', between(1800, 2600), 900, Math.round(4 * 63.5 * 0.25), null, stamp(r.d, 20, 10), stamp(r.d, 20, 30));
}

// ---------- Exercícios ----------
const EX = [
  ['Supino reto com barra', 'Peito', 'Barra'], ['Supino inclinado com halteres', 'Peito', 'Halteres'], ['Crucifixo na máquina (peck deck)', 'Peito', 'Máquina'], ['Crossover polia alta', 'Peito', 'Polia'], ['Flexão de braço', 'Peito', 'Peso corporal'],
  ['Puxada frente na polia', 'Costas', 'Polia'], ['Remada curvada com barra', 'Costas', 'Barra'], ['Remada baixa no triângulo', 'Costas', 'Polia'], ['Remada unilateral com halter', 'Costas', 'Halteres'], ['Barra fixa pronada', 'Costas', 'Peso corporal'], ['Pulldown braço estendido', 'Costas', 'Polia'],
  ['Agachamento livre', 'Pernas', 'Barra'], ['Leg press 45°', 'Pernas', 'Máquina'], ['Cadeira extensora', 'Pernas', 'Máquina'], ['Mesa flexora', 'Pernas', 'Máquina'], ['Stiff com barra', 'Pernas', 'Barra'], ['Afundo búlgaro', 'Pernas', 'Halteres'], ['Agachamento hack', 'Pernas', 'Máquina'], ['Cadeira abdutora', 'Glúteos', 'Máquina'], ['Elevação pélvica com barra', 'Glúteos', 'Barra'], ['Glúteo na polia (coice)', 'Glúteos', 'Polia'],
  ['Panturrilha em pé na máquina', 'Panturrilha', 'Máquina'], ['Panturrilha sentado', 'Panturrilha', 'Máquina'],
  ['Desenvolvimento com halteres', 'Ombros', 'Halteres'], ['Elevação lateral', 'Ombros', 'Halteres'], ['Elevação frontal com anilha', 'Ombros', 'Anilha'], ['Crucifixo inverso', 'Ombros', 'Máquina'], ['Face pull', 'Ombros', 'Polia'],
  ['Rosca direta com barra W', 'Bíceps', 'Barra'], ['Rosca alternada', 'Bíceps', 'Halteres'], ['Rosca martelo', 'Bíceps', 'Halteres'], ['Rosca Scott', 'Bíceps', 'Máquina'],
  ['Tríceps corda na polia', 'Tríceps', 'Polia'], ['Tríceps testa', 'Tríceps', 'Barra'], ['Tríceps francês com halter', 'Tríceps', 'Halteres'], ['Mergulho no banco', 'Tríceps', 'Peso corporal'],
  ['Prancha isométrica', 'Core', 'Peso corporal'], ['Abdominal infra no banco', 'Core', 'Peso corporal'], ['Abdominal na polia (crunch)', 'Core', 'Polia'], ['Pallof press', 'Core', 'Polia'],
  ['Caminhada inclinada na esteira', 'Cardio', 'Esteira'], ['Bicicleta ergométrica', 'Cardio', 'Bike'], ['Escada (simulador)', 'Cardio', 'Máquina'], ['Remo ergômetro', 'Cardio', 'Remo'],
];
const exId = {};
for (const [n, mu, eq] of EX) exId[n] = run('INSERT INTO exercises (gym_id, name, muscle, equipment) VALUES (NULL,?,?,?)', n, mu, eq).lastInsertRowid;

const TEMPLATES = {
  'Hipertrofia ABC': {
    goal: 'Hipertrofia',
    A: [['Supino reto com barra', 4, '8-10', 40, 90], ['Supino inclinado com halteres', 3, '10-12', 18, 75], ['Crossover polia alta', 3, '12-15', 15, 60], ['Desenvolvimento com halteres', 3, '10', 14, 75], ['Elevação lateral', 4, '12-15', 8, 45], ['Tríceps corda na polia', 4, '12', 25, 45]],
    B: [['Puxada frente na polia', 4, '10', 55, 75], ['Remada curvada com barra', 4, '8-10', 40, 90], ['Remada unilateral com halter', 3, '10 cada lado', 22, 60], ['Face pull', 3, '15', 20, 45], ['Rosca direta com barra W', 3, '10', 25, 60], ['Rosca martelo', 3, '12', 12, 45]],
    C: [['Agachamento livre', 4, '8', 60, 120], ['Leg press 45°', 4, '12', 180, 90], ['Cadeira extensora', 3, '12-15', 45, 60], ['Mesa flexora', 4, '10-12', 35, 60], ['Stiff com barra', 3, '10', 40, 75], ['Panturrilha em pé na máquina', 4, '15', 60, 45]],
  },
  'Inferiores com ênfase em glúteos (AB)': {
    goal: 'Glúteos e posterior',
    A: [['Elevação pélvica com barra', 4, '10', 60, 90], ['Afundo búlgaro', 3, '10 cada perna', 10, 75], ['Cadeira abdutora', 4, '15', 50, 45], ['Glúteo na polia (coice)', 3, '12 cada perna', 10, 45], ['Prancha isométrica', 3, '40s', null, 30]],
    B: [['Agachamento hack', 4, '10', 60, 90], ['Stiff com barra', 4, '10', 35, 75], ['Mesa flexora', 3, '12', 30, 60], ['Panturrilha sentado', 4, '15', 30, 45], ['Caminhada inclinada na esteira', 1, '20 min', null, 0]],
  },
  'Adaptação full body': {
    goal: 'Condicionamento',
    A: [['Leg press 45°', 3, '12', 80, 60], ['Puxada frente na polia', 3, '12', 35, 60], ['Supino inclinado com halteres', 3, '12', 10, 60], ['Mesa flexora', 3, '12', 20, 60], ['Elevação lateral', 3, '12', 4, 45], ['Abdominal infra no banco', 3, '15', null, 30], ['Bicicleta ergométrica', 1, '15 min', null, 0]],
  },
};
function makeWorkout(memberId, tplName, createdBack) {
  const tpl = TEMPLATES[tplName];
  const id = run('INSERT INTO workouts (gym_id, member_id, name, goal, valid_until, created_by, created_at) VALUES (?,?,?,?,?,?,?)', gymId, memberId, tplName, tpl.goal, addDays(T, between(10, 70)), coach, stamp(addDays(T, -createdBack))).lastInsertRowid;
  for (const div of ['A', 'B', 'C', 'D'].filter((d) => tpl[d])) {
    tpl[div].forEach(([ex, sets, reps, load, rest], i) =>
      run('INSERT INTO workout_items (workout_id, division, position, exercise_id, sets, reps, load_kg, rest_sec) VALUES (?,?,?,?,?,?,?,?)', id, div, i, exId[ex], sets, reps, load, rest)
    );
  }
  return id;
}
const wMariana = makeWorkout(mariana.id, 'Hipertrofia ABC', 32);
for (const m of members.slice(3, 60)) makeWorkout(m.id, pick(Object.keys(TEMPLATES)), between(5, 80));
// histórico de treinos da Mariana = dias em que ela passou na catraca
const marDays = all(`SELECT DISTINCT substr(created_at,1,10) AS d, MIN(created_at) AS t FROM access_logs WHERE member_id = ? AND granted = 1 AND direction='entrada' AND created_at >= ? GROUP BY d ORDER BY d`, mariana.id, addDays(T, -32));
marDays.forEach((r, i) => {
  if (r.d === T) return;
  const done = dateTimeStr(new Date(new Date(r.t.replace(' ', 'T')).getTime() + 65 * 60_000));
  run('INSERT INTO workout_sessions (member_id, workout_id, division, done_at, duration_min, effort) VALUES (?,?,?,?,?,?)', mariana.id, wMariana, 'ABC'[i % 3], done, between(48, 75), between(6, 9));
});

// ---------- Dietas ----------
function makeDiet(memberId, kcal) {
  const id = run('INSERT INTO diets (gym_id, member_id, name, kcal_target, notes, created_by, created_at) VALUES (?,?,?,?,?,?,?)', gymId, memberId, 'Recomposição corporal', kcal, 'Beber 35 ml de água por kg ao dia. Trocas livres dentro do mesmo grupo.', coach, stamp(addDays(T, -20))).lastInsertRowid;
  const meals = [
    ['Café da manhã', '07:00', [['Pão francês', '1 unidade', 135, 4.5, 28, 1.5], ['Ovos mexidos', '2 unidades', 156, 13, 1, 11], ['Mamão papaia', '1/2 unidade', 60, 0.8, 15, 0.2], ['Café sem açúcar', '1 xícara', 2, 0, 0, 0]]],
    ['Lanche da manhã', '10:00', [['Iogurte natural desnatado', '170 g', 70, 7, 10, 0], ['Aveia em flocos', '20 g', 75, 2.8, 13, 1.4]]],
    ['Almoço', '12:30', [['Arroz branco', '4 colheres de sopa (100 g)', 128, 2.5, 28, 0.2], ['Feijão carioca', '1 concha (86 g)', 66, 4.1, 12, 0.5], ['Peito de frango grelhado', '120 g', 198, 38, 0, 4.3], ['Salada de folhas com tomate', 'à vontade', 25, 1.2, 5, 0.2], ['Azeite de oliva', '1 colher de chá', 40, 0, 0, 4.5]]],
    ['Pré-treino', '17:00', [['Banana prata', '1 unidade', 98, 1.3, 26, 0.1], ['Pasta de amendoim', '15 g', 90, 3.7, 3, 7.5]]],
    ['Jantar', '20:30', [['Batata-doce cozida', '150 g', 115, 1.4, 27, 0.1], ['Patinho moído', '120 g', 219, 36, 0, 7.3], ['Brócolis cozido', '1 xícara', 31, 2.6, 6, 0.3]]],
    ['Ceia', '22:30', [['Whey protein', '1 dose (30 g)', 120, 24, 3, 1.5]]],
  ];
  meals.forEach(([name, time, items], i) => {
    const mid = run('INSERT INTO diet_meals (diet_id, position, name, time) VALUES (?,?,?,?)', id, i, name, time).lastInsertRowid;
    for (const [f, q, k, p, c, g] of items) run('INSERT INTO diet_items (meal_id, food, qty, kcal, protein_g, carbs_g, fat_g) VALUES (?,?,?,?,?,?,?)', mid, f, q, k, p, c, g);
  });
}
makeDiet(mariana.id, 1900);
for (const m of members.slice(10, 24)) makeDiet(m.id, pick([1700, 1900, 2200, 2500]));

// ---------- Leads (CRM) ----------
const leadStages = ['novo', 'novo', 'novo', 'contato', 'contato', 'contato', 'visita', 'visita', 'experimental', 'experimental', 'experimental', 'negociacao', 'negociacao', 'perdido', 'perdido'];
const notesByStage = {
  contato: 'Chamei no WhatsApp, pediu valores do anual',
  visita: 'Veio conhecer a academia, gostou da área de peso livre',
  experimental: 'Aula experimental agendada com o professor Diego',
  negociacao: 'Pediu desconto para fechar o anual. Avaliar 10%',
  perdido: 'Achou caro, vai pensar',
};
for (let i = 0; i < 34; i++) {
  const female = chance(0.55);
  const created = addDays(T, -between(0, 28));
  const stage = pick(leadStages);
  const id = run(
    `INSERT INTO leads (gym_id, name, phone, email, source, stage, interest_plan_id, next_contact, lost_reason, owner_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    gymId,
    `${pick(female ? firstF : firstM)} ${pick(lasts)}`,
    `119${between(10000000, 99999999)}`,
    null,
    pick(['instagram', 'instagram', 'google', 'indicacao', 'site', 'passou_na_frente']),
    stage,
    chance(0.6) ? pick(Object.values(plans)) : null,
    stage === 'perdido' ? null : addDays(T, between(-4, 5)),
    stage === 'perdido' ? pick(['preco', 'horario', 'distancia', 'sem_retorno']) : null,
    chance(0.7) ? reception : owner,
    stamp(created, between(8, 21)),
    stamp(addDays(created, between(0, 3)) > T ? T : addDays(created, between(0, 3)), between(8, 21))
  ).lastInsertRowid;
  run(`INSERT INTO lead_events (lead_id, user_id, kind, note, created_at) VALUES (?,?, 'criado', ?, ?)`, id, reception, 'Lead cadastrado', stamp(created, 9));
  if (notesByStage[stage]) run(`INSERT INTO lead_events (lead_id, user_id, kind, note, created_at) VALUES (?,?,?,?,?)`, id, reception, stage, notesByStage[stage], stamp(addDays(created, 1) > T ? T : addDays(created, 1), 15));
}
// leads convertidos (histórico do funil)
for (const m of members.filter((x) => x.created >= addDays(T, -28)).slice(0, 8)) {
  run(`INSERT INTO leads (gym_id, name, phone, source, stage, member_id, owner_id, created_at, updated_at) VALUES (?,?,?,?, 'matriculado', ?, ?, ?, ?)`, gymId, m.name, `119${between(10000000, 99999999)}`, 'instagram', m.id, reception, stamp(addDays(m.created, -3)), stamp(m.created));
}

// usuário do app para a Mariana
addUser(mariana.name, 'aluno@contrapeso.com.br', 'aluno', mariana.id);

db.exec('COMMIT');

const c = (sql, ...p) => one(sql, ...p).n;
console.log(`Academia Contrapeso criada:
  ${c('SELECT COUNT(*) AS n FROM members')} alunos, ${c("SELECT COUNT(*) AS n FROM contracts WHERE status='ativo'")} contratos ativos
  ${c('SELECT COUNT(*) AS n FROM invoices')} faturas, ${c("SELECT COUNT(*) AS n FROM invoices WHERE status='pendente' AND due_date < ?", T)} vencidas
  ${c('SELECT COUNT(*) AS n FROM access_logs')} passagens na catraca (${c('SELECT COUNT(*) AS n FROM access_logs WHERE granted = 0')} bloqueios)
  ${c('SELECT COUNT(*) AS n FROM leads')} leads no CRM

Logins (senha: fitmanager123)
  Dono       dono@contrapeso.com.br
  Recepção   recepcao@contrapeso.com.br
  Professor  professor@contrapeso.com.br
  Aluno      aluno@contrapeso.com.br`);
