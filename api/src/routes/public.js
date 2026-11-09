import { Router } from 'express';
import { one, all, run, tx } from '../db.js';
import { h, bad, requireFields, HttpError, notFound } from '../lib/http.js';
import { issueToken, checkPassword, hashPassword, randomToken } from '../lib/auth.js';
import { now } from '../lib/time.js';
import { onlyDigits } from '../lib/cpf.js';
import { auth } from '../middleware.js';

const r = Router();

// Proteção simples contra força bruta: 8 tentativas por e-mail a cada 15 min.
const attempts = new Map();
function throttle(key) {
  const t = Date.now();
  const list = (attempts.get(key) || []).filter((x) => t - x < 15 * 60_000);
  if (list.length >= 8) throw new HttpError(429, 'Muitas tentativas. Aguarde 15 minutos.');
  list.push(t);
  attempts.set(key, list);
}

r.post(
  '/auth/login',
  h((req) => {
    requireFields(req.body, ['email', 'password']);
    const email = String(req.body.email).trim().toLowerCase();
    throttle(email);
    const u = one('SELECT * FROM users WHERE email = ?', email);
    if (!u || !u.active || !checkPassword(req.body.password, u.password_hash)) throw new HttpError(401, 'E-mail ou senha incorretos');
    attempts.delete(email);
    const gym = one('SELECT id, name, slug FROM gyms WHERE id = ?', u.gym_id);
    return {
      token: issueToken({ uid: u.id }, u.role === 'aluno' ? 24 * 30 : 12),
      user: { id: u.id, name: u.name, email: u.email, role: u.role, member_id: u.member_id },
      gym,
    };
  })
);

r.get(
  '/auth/me',
  auth,
  h((req) => ({ user: req.user, gym: { id: req.gym.id, name: req.gym.name, slug: req.gym.slug, saas_plan: req.gym.saas_plan } }))
);

const SAAS_PLANS = ['essencial', 'performance', 'rede'];
const slugify = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

/** Contratação do FitManager por uma nova academia: cria tenant, dono e configuração inicial. */
r.post(
  '/public/signup',
  h((req) => {
    const b = req.body || {};
    requireFields(b, ['gym_name', 'owner_name', 'email', 'password']);
    const email = String(b.email).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad('E-mail inválido');
    if (String(b.password).length < 8) throw bad('A senha precisa ter pelo menos 8 caracteres');
    if (one('SELECT id FROM users WHERE email = ?', email)) throw bad('Já existe uma conta com este e-mail');
    const cnpj = onlyDigits(b.cnpj);
    if (cnpj && cnpj.length !== 14) throw bad('CNPJ deve ter 14 dígitos');
    const plan = SAAS_PLANS.includes(b.saas_plan) ? b.saas_plan : 'essencial';
    let slug = slugify(b.gym_name) || 'academia';
    if (one('SELECT id FROM gyms WHERE slug = ?', slug)) slug = `${slug}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, '')}`;

    return tx(() => {
      const gymId = run(
        `INSERT INTO gyms (name, slug, cnpj, phone, pix_key, pix_merchant, pix_city, saas_plan, created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
        b.gym_name.trim(),
        slug,
        cnpj || null,
        b.phone || null,
        b.pix_key || null,
        b.gym_name.trim(),
        b.city || null,
        plan,
        now()
      ).lastInsertRowid;
      const uid = run(
        `INSERT INTO users (gym_id, name, email, password_hash, role, created_at) VALUES (?,?,?,?, 'dono', ?)`,
        gymId,
        b.owner_name.trim(),
        email,
        hashPassword(b.password),
        now()
      ).lastInsertRowid;
      // Planos iniciais editáveis — a academia não começa com tela vazia.
      const ins = `INSERT INTO plans (gym_id, name, months, price_cents, upfront, enrollment_fee_cents, fidelity, cancel_fine_pct, max_daily_entries, hour_start, hour_end, weekdays, freeze_days) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`;
      run(ins, gymId, 'Mensal livre', 1, 14990, 0, 5000, 0, 0, 2, 0, 24, '0123456', 0);
      run(ins, gymId, 'Anual fidelidade', 12, 9990, 0, 0, 1, 30, 2, 0, 24, '0123456', 30);
      run(`INSERT INTO devices (gym_id, name, vendor, direction, token) VALUES (?,?,?,?,?)`, gymId, 'Simulador de catraca', 'simulador', 'ambos', randomToken());
      return {
        token: issueToken({ uid }),
        user: { id: uid, name: b.owner_name, email, role: 'dono' },
        gym: { id: gymId, name: b.gym_name, slug },
      };
    });
  })
);

/** Página pública da academia (planos para o site/app). */
r.get(
  '/public/gyms/:slug',
  h((req) => {
    const g = one('SELECT id, name, slug, phone, address, open_hour, close_hour FROM gyms WHERE slug = ?', req.params.slug);
    if (!g) throw notFound('Academia');
    const plans = all(
      `SELECT id, name, months, price_cents, upfront, enrollment_fee_cents, fidelity, hour_start, hour_end, weekdays FROM plans WHERE gym_id = ? AND active = 1 ORDER BY price_cents DESC`,
      g.id
    );
    return { ...g, id: undefined, plans };
  })
);

/** Captura de lead (formulário "agende uma aula experimental") — entra direto no funil do CRM. */
r.post(
  '/public/gyms/:slug/leads',
  h((req) => {
    const g = one('SELECT id FROM gyms WHERE slug = ?', req.params.slug);
    if (!g) throw notFound('Academia');
    requireFields(req.body, ['name', 'phone']);
    const phone = onlyDigits(req.body.phone);
    if (phone.length < 10) throw bad('Telefone com DDD, por favor');
    const dup = one(`SELECT id FROM leads WHERE gym_id = ? AND phone = ? AND stage NOT IN ('matriculado','perdido')`, g.id, phone);
    if (dup) return { ok: true, duplicate: true };
    const id = run(
      `INSERT INTO leads (gym_id, name, phone, email, source, stage, created_at, updated_at) VALUES (?,?,?,?, 'site', 'novo', ?, ?)`,
      g.id,
      String(req.body.name).trim(),
      phone,
      req.body.email || null,
      now(),
      now()
    ).lastInsertRowid;
    run(`INSERT INTO lead_events (lead_id, kind, note, created_at) VALUES (?, 'criado', ?, ?)`, id, req.body.message || 'Formulário do site', now());
    return { ok: true };
  })
);

export default r;
