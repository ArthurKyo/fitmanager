import { EventEmitter } from 'node:events';
import { one, all, run } from '../db.js';
import { today, now, dateTimeStr, dateStr, addDays, diffDays } from '../lib/time.js';
import { currentContract, activeFreeze, oldestOverdue } from './billing.js';

/** Eventos em tempo real para o painel (SSE). */
export const accessBus = new EventEmitter();
accessBus.setMaxListeners(200);

export const METHODS = ['digital', 'facial', 'cartao', 'qrcode', 'manual'];

/** Códigos de decisão. A mensagem curta cabe no display da catraca (2 linhas). */
export const CODES = {
  LIBERADO: 'Acesso liberado',
  SAIDA: 'Saída registrada',
  NAO_CADASTRADO: 'Não cadastrado',
  INATIVO: 'Cadastro inativo',
  SEM_PLANO: 'Sem plano ativo',
  PLANO_VENCIDO: 'Plano encerrado',
  PLANO_FUTURO: 'Plano ainda não começou',
  TRANCADO: 'Matrícula trancada',
  INADIMPLENTE: 'Mensalidade em aberto',
  ATESTADO: 'Atestado vencido',
  FORA_DIA: 'Plano não libera hoje',
  FORA_HORARIO: 'Fora do horário do plano',
  FECHADO: 'Academia fechada',
  LIMITE_DIARIO: 'Limite de entradas do dia',
  ANTIPASSBACK: 'Saída não registrada',
  LOTACAO: 'Lotação máxima atingida',
  QR_EXPIRADO: 'QR expirado, gere outro',
  QR_INVALIDO: 'QR inválido',
};

const WEEKDAY = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const br = (d) => d.split('-').reverse().slice(0, 2).join('/');

/** Quantas pessoas estão dentro agora: último evento liberado de hoje é entrada, dentro da janela. */
export function insideNow(gym, at = new Date()) {
  const windowMin = gym.antipassback_minutes || 240;
  const since = dateTimeStr(new Date(at.getTime() - windowMin * 60_000));
  const until = dateTimeStr(at);
  return one(
    `SELECT COUNT(DISTINCT a.member_id) AS n FROM access_logs a
      WHERE a.gym_id = ? AND a.granted = 1 AND a.direction = 'entrada' AND a.created_at BETWEEN ? AND ?
        AND NOT EXISTS (SELECT 1 FROM access_logs b WHERE b.member_id = a.member_id AND b.granted = 1
                          AND b.created_at > a.created_at AND b.created_at <= ?)`,
    gym.id,
    since,
    until,
    until
  ).n;
}

/**
 * Motor de decisão da catraca. Ordem das verificações = ordem em que a recepção
 * resolveria o problema (cadastro → contrato → financeiro → saúde → regras do plano → operação).
 * Saída nunca é bloqueada (segurança/rota de fuga), apenas registrada.
 */
export function evaluateAccess({ gym, memberId, direction = 'entrada', at = new Date() }) {
  const on = dateStr(at);
  const hour = at.getHours();
  const deny = (code, message, extra = {}) => ({ granted: false, code, message: message || CODES[code], ...extra });

  const member = memberId ? one('SELECT * FROM members WHERE id = ? AND gym_id = ?', memberId, gym.id) : null;
  if (!member) return deny('NAO_CADASTRADO', 'Procure a recepção');
  if (direction === 'saida') return { granted: true, code: 'SAIDA', message: `Até logo, ${member.name.split(' ')[0]}`, member };
  if (member.status !== 'ativo') return deny('INATIVO', 'Procure a recepção', { member });

  if (hour < gym.open_hour || hour >= gym.close_hour)
    return deny('FECHADO', `Funcionamos das ${gym.open_hour}h às ${gym.close_hour}h`, { member });

  const contract = currentContract(member.id, on);
  if (!contract) {
    const future = one(`SELECT start_date FROM contracts WHERE member_id = ? AND status='ativo' AND start_date > ? ORDER BY start_date LIMIT 1`, member.id, on);
    if (future) return deny('PLANO_FUTURO', `Seu plano começa em ${br(future.start_date)}`, { member });
    const last = one(`SELECT end_date FROM contracts WHERE member_id = ? ORDER BY end_date DESC LIMIT 1`, member.id);
    return last
      ? deny('PLANO_VENCIDO', `Plano terminou em ${br(last.end_date)}. Renove na recepção`, { member })
      : deny('SEM_PLANO', 'Procure a recepção', { member });
  }

  const freeze = activeFreeze(contract.id, on);
  if (freeze) return deny('TRANCADO', `Trancada até ${br(freeze.end_date)}`, { member, contract });

  const overdue = oldestOverdue(member.id, on);
  if (overdue && diffDays(overdue.due_date, on) > gym.overdue_tolerance_days)
    return deny('INADIMPLENTE', `Vencida em ${br(overdue.due_date)}. Pague no app ou na recepção`, { member, contract });

  if (gym.require_medical && (!member.medical_valid_until || member.medical_valid_until < on))
    return deny('ATESTADO', 'Traga um atestado médico atualizado', { member, contract });

  if (!contract.weekdays.includes(String(at.getDay())))
    return deny('FORA_DIA', `Seu plano não libera ${WEEKDAY[at.getDay()]}`, { member, contract });

  if (hour < contract.hour_start || hour >= contract.hour_end)
    return deny('FORA_HORARIO', `Seu plano libera das ${contract.hour_start}h às ${contract.hour_end}h`, { member, contract });

  const todayEntries = one(
    `SELECT COUNT(*) AS n FROM access_logs WHERE member_id = ? AND granted = 1 AND direction = 'entrada' AND created_at >= ? AND created_at <= ?`,
    member.id,
    `${on} 00:00:00`,
    dateTimeStr(at)
  ).n;
  if (contract.max_daily_entries > 0 && todayEntries >= contract.max_daily_entries)
    return deny('LIMITE_DIARIO', `Seu plano permite ${contract.max_daily_entries} entrada(s) por dia`, { member, contract });

  if (gym.antipassback_minutes > 0) {
    const last = one(
      `SELECT direction, created_at FROM access_logs WHERE member_id = ? AND granted = 1 AND created_at <= ? ORDER BY created_at DESC LIMIT 1`,
      member.id,
      dateTimeStr(at)
    );
    const since = dateTimeStr(new Date(at.getTime() - gym.antipassback_minutes * 60_000));
    if (last && last.direction === 'entrada' && last.created_at >= since)
      return deny('ANTIPASSBACK', 'Registre a saída antes de entrar de novo', { member, contract });
  }

  if (gym.max_capacity > 0 && insideNow(gym, at) >= gym.max_capacity)
    return deny('LOTACAO', 'Aguarde alguns minutos', { member, contract });

  // Liberado — mensagem de boas-vindas com avisos úteis.
  const first = member.name.split(' ')[0];
  let message = `Bom treino, ${first}!`;
  if (member.birth_date.slice(5) === on.slice(5)) message = `Feliz aniversário, ${first}!`;
  else if (overdue) message = `${first}, mensalidade vencida em ${br(overdue.due_date)}`;
  else {
    const soon = one(`SELECT due_date FROM invoices WHERE member_id = ? AND status='pendente' AND due_date BETWEEN ? AND ? ORDER BY due_date LIMIT 1`, member.id, on, addDays(on, 3));
    if (soon) message = `${first}, mensalidade vence ${soon.due_date === on ? 'hoje' : `em ${br(soon.due_date)}`}`;
    else if (contract.end_date <= addDays(on, 7)) message = `${first}, seu plano termina em ${br(contract.end_date)}`;
  }
  return { granted: true, code: 'LIBERADO', message, member, contract };
}

/** Registra a decisão e notifica o painel. */
export function recordAccess({ gym, device, memberId, method, direction, decision, operator, at = new Date() }) {
  const created = dateTimeStr(at);
  const id = run(
    `INSERT INTO access_logs (gym_id, member_id, device_id, method, direction, granted, code, message, operator_id, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    gym.id,
    decision.member?.id ?? null, // id desconhecido não vira FK quebrada; vai na mensagem
    device?.id ?? null,
    method,
    direction,
    decision.granted ? 1 : 0,
    decision.code,
    !decision.member && memberId ? `${decision.message} (id ${memberId} lido no equipamento)` : decision.message,
    operator?.id ?? null,
    created
  ).lastInsertRowid;
  const event = {
    id,
    created_at: created,
    member_id: decision.member?.id ?? null,
    member_name: decision.member?.name ?? null,
    device_name: device?.name ?? 'Recepção',
    method,
    direction,
    granted: decision.granted,
    code: decision.code,
    label: CODES[decision.code],
    message: decision.message,
    inside: insideNow(gym, at),
  };
  accessBus.emit(`gym:${gym.id}`, event);
  return event;
}

export function hourlyProfile(gymId, on = today()) {
  const rows = all(
    `SELECT CAST(substr(created_at, 12, 2) AS INTEGER) AS h, COUNT(*) AS n FROM access_logs
      WHERE gym_id = ? AND granted = 1 AND direction = 'entrada' AND created_at BETWEEN ? AND ?
      GROUP BY h`,
    gymId,
    `${on} 00:00:00`,
    `${on} 23:59:59`
  );
  const out = Array(24).fill(0);
  for (const r of rows) out[r.h] = r.n;
  return out;
}

/** Média por hora das últimas 4 semanas, mesmo dia da semana. */
export function hourlyBaseline(gymId, on = today()) {
  const out = Array(24).fill(0);
  for (let w = 1; w <= 4; w++) hourlyProfile(gymId, addDays(on, -7 * w)).forEach((n, i) => (out[i] += n / 4));
  return out.map((n) => Math.round(n * 10) / 10);
}

export { now };
