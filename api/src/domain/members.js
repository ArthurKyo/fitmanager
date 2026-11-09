import { one, all } from '../db.js';
import { today, addDays, diffDays, age } from '../lib/time.js';
import { currentContract, activeFreeze, oldestOverdue } from './billing.js';

/**
 * Situação do aluno, a mesma lógica que a catraca usa, resumida para listas e CRM.
 * em_dia | vence_logo | vencido | bloqueado | trancado | sem_plano | inativo
 */
export function situation(member, gym, on = today()) {
  if (member.status !== 'ativo') return { key: 'inativo', label: 'Inativo' };
  const c = currentContract(member.id, on);
  if (!c) return { key: 'sem_plano', label: 'Sem plano' };
  const f = activeFreeze(c.id, on);
  if (f) return { key: 'trancado', label: `Trancado até ${f.end_date.split('-').reverse().join('/')}`, contract: c };
  const od = oldestOverdue(member.id, on);
  if (od) {
    const late = diffDays(od.due_date, on);
    return late > gym.overdue_tolerance_days
      ? { key: 'bloqueado', label: `Bloqueado, ${late} dias em atraso`, contract: c, daysLate: late }
      : { key: 'vencido', label: `Atrasado há ${late} dia(s), ainda entra`, contract: c, daysLate: late };
  }
  if (c.end_date <= addDays(on, 7)) return { key: 'vence_logo', label: 'Renovação próxima', contract: c };
  return { key: 'em_dia', label: 'Em dia', contract: c };
}

export function lastVisit(memberId) {
  return one(`SELECT MAX(created_at) AS at FROM access_logs WHERE member_id = ? AND granted = 1 AND direction = 'entrada'`, memberId)?.at || null;
}

export function memberSummary(m, gym) {
  const s = situation(m, gym);
  const last = lastVisit(m.id);
  return {
    id: m.id,
    name: m.name,
    cpf: m.cpf,
    phone: m.phone,
    email: m.email,
    birth_date: m.birth_date,
    age: age(m.birth_date),
    status: m.status,
    medical_valid_until: m.medical_valid_until,
    created_at: m.created_at,
    situation: s.key,
    situation_label: s.label,
    plan_name: s.contract?.plan_name || null,
    contract_end: s.contract?.end_date || null,
    last_visit: last,
    days_absent: last ? diffDays(last.slice(0, 10), today()) : null,
  };
}

/** Risco de evasão: ativo com plano, mas sumido. Base do trabalho de retenção do CRM. */
export function churnRisk(gym, minDays = 10) {
  const rows = all(`SELECT * FROM members WHERE gym_id = ? AND status = 'ativo'`, gym.id);
  return rows
    .map((m) => memberSummary(m, gym))
    .filter((m) => ['em_dia', 'vence_logo', 'vencido'].includes(m.situation) && (m.days_absent === null || m.days_absent >= minDays))
    .sort((a, b) => (b.days_absent ?? 999) - (a.days_absent ?? 999));
}
