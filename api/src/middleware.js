import { one } from './db.js';
import { verifyToken } from './lib/auth.js';
import { HttpError, forbidden } from './lib/http.js';

/** Autenticação por Bearer token. Todo acesso a dados é escopado por req.gym.id (multi-tenant). */
export function auth(req, _res, next) {
  const raw = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.query.token;
  const payload = verifyToken(raw);
  if (!payload) return next(new HttpError(401, 'Sessão expirada. Entre novamente.'));
  const user = one('SELECT id, gym_id, name, email, role, member_id, active FROM users WHERE id = ?', payload.uid);
  if (!user || !user.active) return next(new HttpError(401, 'Usuário desativado'));
  req.user = user;
  req.gym = one('SELECT * FROM gyms WHERE id = ?', user.gym_id);
  next();
}

/**
 * Perfis:
 *  dono       — tudo, inclusive financeiro consolidado, planos, equipe e configurações
 *  recepcao   — alunos, matrículas, recebimentos, catraca, CRM
 *  professor  — treinos, dietas, consulta de alunos e frequência
 *  aluno      — apenas /api/me (app)
 */
export const allow =
  (...roles) =>
  (req, _res, next) =>
    roles.includes(req.user?.role) ? next() : next(forbidden());

export const STAFF = ['dono', 'recepcao', 'professor'];
