import { Router } from 'express';
import { one, all, run } from '../db.js';
import { h, bad, notFound, requireFields, HttpError } from '../lib/http.js';
import { today, now, isValidDate } from '../lib/time.js';
import { readAccessQR, randomToken } from '../lib/auth.js';
import { allow, STAFF } from '../middleware.js';
import { evaluateAccess, recordAccess, accessBus, METHODS, CODES, insideNow } from '../domain/access.js';

export const access = Router();
export const bridge = Router();

/** Fluxo único usado pela catraca real, pelo simulador e pelo QR do app. */
export function identify({ gym, device, memberId, qr, method, direction, at = new Date() }) {
  if (!METHODS.includes(method)) throw bad(`Método inválido (${METHODS.join(', ')})`);
  let dir = direction || (device?.direction === 'saida' ? 'saida' : 'entrada');
  if (device && device.direction !== 'ambos' && device.direction !== dir) dir = device.direction;
  let decision;
  if (qr) {
    const q = readAccessQR(qr, at.getTime());
    if (!q) decision = { granted: false, code: 'QR_INVALIDO', message: CODES.QR_INVALIDO };
    else if (q.expired) decision = { granted: false, code: 'QR_EXPIRADO', message: CODES.QR_EXPIRADO, member: one('SELECT * FROM members WHERE id = ? AND gym_id = ?', q.memberId, gym.id) };
    else memberId = q.memberId;
  }
  decision ||= evaluateAccess({ gym, memberId: Number(memberId), direction: dir, at });
  return recordAccess({ gym, device, memberId, method, direction: dir, decision, at });
}

// ---------- Painel ----------
access.get(
  '/logs',
  allow(...STAFF),
  h((req) => {
    const date = isValidDate(req.query.date) ? req.query.date : today();
    const rows = all(
      `SELECT a.*, m.name AS member_name, d.name AS device_name, u.name AS operator_name
         FROM access_logs a LEFT JOIN members m ON m.id = a.member_id LEFT JOIN devices d ON d.id = a.device_id
         LEFT JOIN users u ON u.id = a.operator_id
        WHERE a.gym_id = ? AND a.created_at BETWEEN ? AND ?
          AND (? = '' OR a.granted = ?)
        ORDER BY a.created_at DESC LIMIT 500`,
      req.gym.id,
      `${date} 00:00:00`,
      `${date} 23:59:59`,
      req.query.granted ?? '',
      req.query.granted === '1' ? 1 : 0
    ).map((a) => ({ ...a, label: CODES[a.code] }));
    return { date, inside: insideNow(req.gym), items: rows };
  })
);

/** Stream em tempo real (Server-Sent Events). EventSource não manda header, então o token vai na query. */
access.get('/stream', allow(...STAFF), (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write(`event: hello\ndata: ${JSON.stringify({ inside: insideNow(req.gym) })}\n\n`);
  const send = (ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  accessBus.on(`gym:${req.gym.id}`, send);
  req.on('close', () => {
    clearInterval(ping);
    accessBus.off(`gym:${req.gym.id}`, send);
  });
});

/**
 * Liberação pela recepção. Se as regras negariam, o operador precisa justificar —
 * fica registrado com o nome dele (auditoria de "catraca liberada no braço").
 */
access.post(
  '/manual',
  allow('dono', 'recepcao'),
  h((req) => {
    const { member_id, device_id, reason } = req.body || {};
    const direction = req.body?.direction === 'saida' ? 'saida' : 'entrada';
    const device = device_id ? one('SELECT * FROM devices WHERE id = ? AND gym_id = ?', device_id, req.gym.id) : null;
    if (device_id && !device) throw notFound('Catraca');
    const decision = member_id ? evaluateAccess({ gym: req.gym, memberId: Number(member_id), direction }) : { granted: false, code: 'NAO_CADASTRADO' };
    if (!decision.granted) {
      if (!reason || String(reason).trim().length < 4)
        throw bad(`Regras bloqueiam: ${CODES[decision.code]}. Informe a justificativa para liberar mesmo assim.`, { code: decision.code });
      decision.granted = true;
      decision.message = `Liberado por ${req.user.name.split(' ')[0]}: ${String(reason).trim()}`;
      decision.code = 'LIBERADO';
    }
    if (device) run(`INSERT INTO device_commands (device_id, action, payload, created_by, created_at) VALUES (?, 'open', ?, ?, ?)`, device.id, JSON.stringify({ direction }), req.user.id, now());
    return recordAccess({ gym: req.gym, device, memberId: member_id, method: 'manual', direction, decision, operator: req.user });
  })
);

/** Simulador: dispara o mesmo fluxo da catraca a partir do painel (testes e demonstração). */
access.post(
  '/simulate',
  allow('dono', 'recepcao'),
  h((req) => {
    const device = one('SELECT * FROM devices WHERE id = ? AND gym_id = ?', req.body?.device_id, req.gym.id);
    if (!device) throw notFound('Catraca');
    run('UPDATE devices SET last_seen = ? WHERE id = ?', now(), device.id);
    return identify({ gym: req.gym, device, memberId: req.body.member_id, qr: req.body.qr, method: req.body.method || 'digital', direction: req.body.direction });
  })
);

access.get(
  '/devices',
  allow(...STAFF),
  h((req) =>
    all('SELECT * FROM devices WHERE gym_id = ? ORDER BY name', req.gym.id).map((d) => ({
      ...d,
      token: req.user.role === 'dono' ? d.token : undefined,
      online: d.last_seen ? Date.now() - new Date(d.last_seen.replace(' ', 'T')).getTime() < 90_000 : false,
      pending_commands: one('SELECT COUNT(*) AS n FROM device_commands WHERE device_id = ? AND done_at IS NULL', d.id).n,
    }))
  )
);

access.post(
  '/devices',
  allow('dono'),
  h((req) => {
    const b = req.body || {};
    requireFields(b, ['name', 'vendor', 'direction']);
    if (!['controlid', 'simulador'].includes(b.vendor)) throw bad('Fabricante não suportado');
    if (!['entrada', 'saida', 'ambos'].includes(b.direction)) throw bad('Sentido inválido');
    if (b.vendor === 'controlid' && !b.host) throw bad('Informe o IP da catraca na rede local');
    const id = run('INSERT INTO devices (gym_id, name, vendor, host, direction, token) VALUES (?,?,?,?,?,?)', req.gym.id, b.name, b.vendor, b.host || null, b.direction, randomToken()).lastInsertRowid;
    return one('SELECT * FROM devices WHERE id = ?', id);
  })
);

access.put(
  '/devices/:id',
  allow('dono'),
  h((req) => {
    const d = one('SELECT * FROM devices WHERE id = ? AND gym_id = ?', req.params.id, req.gym.id);
    if (!d) throw notFound('Catraca');
    const b = { ...d, ...req.body };
    run('UPDATE devices SET name = ?, host = ?, direction = ?, active = ? WHERE id = ?', b.name, b.host, b.direction, b.active ? 1 : 0, d.id);
    if (req.body.rotate_token) run('UPDATE devices SET token = ? WHERE id = ?', randomToken(), d.id);
    return one('SELECT * FROM devices WHERE id = ?', d.id);
  })
);

// ---------- Bridge (agente local que conversa com a catraca) ----------
bridge.use((req, _res, next) => {
  const token = req.headers['x-device-token'];
  const device = token ? one('SELECT * FROM devices WHERE token = ? AND active = 1', token) : null;
  if (!device) return next(new HttpError(401, 'Token de catraca inválido'));
  req.device = device;
  req.gym = one('SELECT * FROM gyms WHERE id = ?', device.gym_id);
  run('UPDATE devices SET last_seen = ? WHERE id = ?', now(), device.id);
  next();
});

bridge.post('/heartbeat', h((req) => ({ ok: true, device: { id: req.device.id, name: req.device.name, direction: req.device.direction }, server_time: now() })));

bridge.post(
  '/identify',
  h((req) => {
    const ev = identify({ gym: req.gym, device: req.device, memberId: req.body?.member_id, qr: req.body?.qr, method: req.body?.method || 'digital', direction: req.body?.direction });
    return { granted: ev.granted, code: ev.code, message: ev.message, member_name: ev.member_name, direction: ev.direction, log_id: ev.id };
  })
);

bridge.get(
  '/commands',
  h((req) =>
    all('SELECT id, action, payload, created_at FROM device_commands WHERE device_id = ? AND done_at IS NULL ORDER BY id LIMIT 20', req.device.id).map((c) => ({
      ...c,
      payload: c.payload ? JSON.parse(c.payload) : null,
    }))
  )
);

bridge.post(
  '/commands/:id/done',
  h((req) => {
    run('UPDATE device_commands SET done_at = ? WHERE id = ? AND device_id = ?', now(), req.params.id, req.device.id);
    return { ok: true };
  })
);

/** Lista de usuários para sincronizar no equipamento (nome + id; a biometria é capturada no próprio aparelho). */
bridge.get(
  '/users',
  h((req) => all(`SELECT id, name FROM members WHERE gym_id = ? AND status = 'ativo' ORDER BY id`, req.gym.id))
);
