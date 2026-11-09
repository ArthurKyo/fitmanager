import { Router } from 'express';
import { one, all, run, tx } from '../db.js';
import { h, bad, notFound, requireFields, int } from '../lib/http.js';
import { isValidCPF, onlyDigits } from '../lib/cpf.js';
import { now, today, age, isValidDate, addDays } from '../lib/time.js';
import { hashPassword, randomToken } from '../lib/auth.js';
import { allow, STAFF } from '../middleware.js';
import { memberSummary, situation } from '../domain/members.js';
import { createContract, invoiceView } from '../domain/billing.js';
import { CODES } from '../domain/access.js';

const r = Router();

function validateMember(b, gymId, id) {
  const cpf = onlyDigits(b.cpf);
  if (!isValidCPF(cpf)) throw bad('CPF inválido');
  const dup = one('SELECT id, name FROM members WHERE gym_id = ? AND cpf = ? AND id != ?', gymId, cpf, id || 0);
  if (dup) throw bad(`CPF já cadastrado para ${dup.name}`, { memberId: dup.id });
  if (!isValidDate(b.birth_date)) throw bad('Data de nascimento inválida');
  const a = age(b.birth_date);
  if (a < 10 || a > 110) throw bad('Idade fora do permitido (mínimo 10 anos)');
  if (a < 18) {
    if (!b.guardian_name || !isValidCPF(b.guardian_cpf))
      throw bad('Aluno menor de idade: informe nome e CPF válido do responsável legal');
  }
  if (b.medical_valid_until && !isValidDate(b.medical_valid_until)) throw bad('Validade do atestado inválida');
  const phone = onlyDigits(b.phone);
  if (phone && phone.length < 10) throw bad('Telefone com DDD');
  return { cpf, phone, adult: a >= 18 };
}

r.get(
  '/',
  allow(...STAFF),
  h((req) => {
    const q = String(req.query.q || '').trim();
    const digits = onlyDigits(q);
    let rows = all(
      `SELECT * FROM members WHERE gym_id = ? AND (? = '' OR name LIKE ? OR (? != '' AND (cpf LIKE ? OR phone LIKE ?))) ORDER BY name`,
      req.gym.id,
      q,
      `%${q}%`,
      digits,
      `${digits}%`,
      `%${digits}%`
    ).map((m) => memberSummary(m, req.gym));
    const counts = rows.reduce((acc, m) => ((acc[m.situation] = (acc[m.situation] || 0) + 1), acc), {});
    if (req.query.situation) rows = rows.filter((m) => m.situation === req.query.situation);
    const limit = Math.min(int(req.query.limit, 50), 200);
    const offset = int(req.query.offset, 0);
    return { total: rows.length, counts, items: rows.slice(offset, offset + limit) };
  })
);

r.get(
  '/:id',
  allow(...STAFF),
  h((req) => {
    const m = one('SELECT * FROM members WHERE id = ? AND gym_id = ?', req.params.id, req.gym.id);
    if (!m) throw notFound('Aluno');
    const contracts = all(
      `SELECT c.*, p.name AS plan_name, p.freeze_days, p.fidelity, p.cancel_fine_pct FROM contracts c JOIN plans p ON p.id = c.plan_id
        WHERE c.member_id = ? ORDER BY c.start_date DESC`,
      m.id
    );
    for (const c of contracts) c.freezes = all('SELECT * FROM freezes WHERE contract_id = ? ORDER BY start_date', c.id);
    const invoices = all('SELECT * FROM invoices WHERE member_id = ? ORDER BY due_date DESC', m.id).map((i) => invoiceView(i));
    const access = all(
      `SELECT a.*, d.name AS device_name FROM access_logs a LEFT JOIN devices d ON d.id = a.device_id
        WHERE a.member_id = ? ORDER BY a.created_at DESC LIMIT 60`,
      m.id
    ).map((a) => ({ ...a, label: CODES[a.code] }));
    const visits30 = one(
      `SELECT COUNT(DISTINCT substr(created_at,1,10)) AS n FROM access_logs WHERE member_id = ? AND granted = 1 AND direction='entrada' AND created_at >= ?`,
      m.id,
      addDays(today(), -30)
    ).n;
    const login = one('SELECT id, email, active FROM users WHERE member_id = ?', m.id);
    return {
      ...memberSummary(m, req.gym),
      ...m,
      situation_detail: situation(m, req.gym),
      contracts,
      invoices,
      access,
      visits30,
      credentials: all('SELECT * FROM credentials WHERE member_id = ? ORDER BY kind', m.id),
      workouts: all('SELECT id, name, goal, valid_until, active FROM workouts WHERE member_id = ? ORDER BY active DESC, created_at DESC', m.id),
      diets: all('SELECT id, name, kcal_target, active FROM diets WHERE member_id = ? ORDER BY active DESC, created_at DESC', m.id),
      app_login: login || null,
      cardio: all('SELECT id, kind, mode, distance_m, duration_s, kcal, started_at FROM cardio_sessions WHERE member_id = ? ORDER BY started_at DESC LIMIT 10', m.id),
      payment_profile: one('SELECT card_brand, card_last4, autopay FROM payment_profiles WHERE member_id = ?', m.id) || null,
    };
  })
);

/** Cadastro + venda de plano numa operação só (fluxo de balcão). */
r.post(
  '/',
  allow('dono', 'recepcao'),
  h((req) => {
    const b = req.body || {};
    requireFields(b, ['name', 'cpf', 'birth_date', 'phone']);
    const v = validateMember(b, req.gym.id);
    return tx(() => {
      const id = run(
        `INSERT INTO members (gym_id, name, cpf, birth_date, phone, email, gender, guardian_name, guardian_cpf, medical_valid_until, source, notes, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        req.gym.id,
        b.name.trim(),
        v.cpf,
        b.birth_date,
        v.phone,
        b.email?.trim().toLowerCase() || null,
        b.gender || null,
        v.adult ? null : b.guardian_name,
        v.adult ? null : onlyDigits(b.guardian_cpf),
        b.medical_valid_until || null,
        b.source || 'balcao',
        b.notes || null,
        now()
      ).lastInsertRowid;
      let contract = null;
      if (b.plan_id) {
        contract = createContract({
          gymId: req.gym.id,
          memberId: id,
          planId: b.plan_id,
          startDate: b.start_date,
          dueDay: b.due_day,
          discountPct: b.discount_pct,
          user: req.user,
        });
      }
      if (b.lead_id) {
        run(`UPDATE leads SET stage = 'matriculado', member_id = ?, updated_at = ? WHERE id = ? AND gym_id = ?`, id, now(), b.lead_id, req.gym.id);
        run(`INSERT INTO lead_events (lead_id, user_id, kind, note, created_at) VALUES (?,?, 'matriculado', 'Convertido em aluno', ?)`, b.lead_id, req.user.id, now());
      }
      return { id, contract };
    });
  })
);

r.put(
  '/:id',
  allow('dono', 'recepcao'),
  h((req) => {
    const m = one('SELECT * FROM members WHERE id = ? AND gym_id = ?', req.params.id, req.gym.id);
    if (!m) throw notFound('Aluno');
    const b = { ...m, ...req.body };
    const v = validateMember(b, req.gym.id, m.id);
    if (!['ativo', 'inativo'].includes(b.status)) throw bad('Status inválido');
    run(
      `UPDATE members SET name=?, cpf=?, birth_date=?, phone=?, email=?, gender=?, guardian_name=?, guardian_cpf=?, medical_valid_until=?, status=?, notes=? WHERE id=?`,
      b.name.trim(),
      v.cpf,
      b.birth_date,
      v.phone,
      b.email || null,
      b.gender || null,
      v.adult ? null : b.guardian_name,
      v.adult ? null : onlyDigits(b.guardian_cpf),
      b.medical_valid_until || null,
      b.status,
      b.notes || null,
      m.id
    );
    if (b.status === 'inativo') run('UPDATE users SET active = 0 WHERE member_id = ?', m.id);
    return { ok: true };
  })
);

/**
 * Cadastro de credencial (digital/face/cartão). A biometria em si fica no equipamento
 * (o template não sai da catraca — exigência de LGPD para dado sensível); aqui guardamos
 * só o vínculo e enfileiramos a sincronização do usuário para cada catraca.
 */
r.post(
  '/:id/credentials',
  allow('dono', 'recepcao'),
  h((req) => {
    const m = one('SELECT * FROM members WHERE id = ? AND gym_id = ?', req.params.id, req.gym.id);
    if (!m) throw notFound('Aluno');
    const { kind, label } = req.body || {};
    if (!['digital', 'facial', 'cartao'].includes(kind)) throw bad('Tipo de credencial inválido');
    if (!req.body.consent) throw bad('Registre o consentimento do aluno para uso de biometria (LGPD art. 11)');
    const lbl = label || (kind === 'digital' ? 'Indicador direito' : kind === 'facial' ? 'Face' : 'Cartão');
    if (one('SELECT id FROM credentials WHERE member_id = ? AND kind = ? AND label = ?', m.id, kind, lbl)) throw bad('Credencial já cadastrada');
    run('INSERT INTO credentials (member_id, kind, label, enrolled_at) VALUES (?,?,?,?)', m.id, kind, lbl, now());
    const devices = all(`SELECT id FROM devices WHERE gym_id = ? AND active = 1 AND vendor = 'controlid'`, req.gym.id);
    for (const d of devices)
      run(
        `INSERT INTO device_commands (device_id, action, payload, created_by, created_at) VALUES (?, 'enroll', ?, ?, ?)`,
        d.id,
        JSON.stringify({ member_id: m.id, name: m.name, kind }),
        req.user.id,
        now()
      );
    return { ok: true, queuedDevices: devices.length };
  })
);

r.delete(
  '/:id/credentials/:cid',
  allow('dono', 'recepcao'),
  h((req) => {
    const c = one(
      'SELECT c.id FROM credentials c JOIN members m ON m.id = c.member_id WHERE c.id = ? AND m.id = ? AND m.gym_id = ?',
      req.params.cid,
      req.params.id,
      req.gym.id
    );
    if (!c) throw notFound('Credencial');
    run('DELETE FROM credentials WHERE id = ?', c.id);
    return { ok: true };
  })
);

/** Cria acesso ao app do aluno com senha provisória. */
r.post(
  '/:id/app-access',
  allow('dono', 'recepcao'),
  h((req) => {
    const m = one('SELECT * FROM members WHERE id = ? AND gym_id = ?', req.params.id, req.gym.id);
    if (!m) throw notFound('Aluno');
    const email = String(req.body?.email || m.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad('Informe um e-mail válido para o login do app');
    const existing = one('SELECT * FROM users WHERE member_id = ?', m.id);
    const other = one('SELECT id FROM users WHERE email = ? AND (member_id IS NULL OR member_id != ?)', email, m.id);
    if (other) throw bad('Este e-mail já é usado por outra conta');
    const temp = `fit-${randomToken(4).replace(/[^A-Za-z0-9]/g, 'x').slice(0, 6)}`;
    if (existing) run('UPDATE users SET email = ?, password_hash = ?, active = 1 WHERE id = ?', email, hashPassword(temp), existing.id);
    else
      run(
        `INSERT INTO users (gym_id, name, email, password_hash, role, member_id, created_at) VALUES (?,?,?,?, 'aluno', ?, ?)`,
        req.gym.id,
        m.name,
        email,
        hashPassword(temp),
        m.id,
        now()
      );
    if (!m.email) run('UPDATE members SET email = ? WHERE id = ?', email, m.id);
    return { email, temporaryPassword: temp };
  })
);

export default r;
