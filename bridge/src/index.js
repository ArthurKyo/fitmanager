/**
 * FitManager Bridge — agente local da catraca.
 *
 * Roda num PC da recepção, na mesma rede das catracas. Faz três coisas:
 *  1. Recebe a identificação do equipamento (digital/face/cartão) e pergunta à API
 *     se libera, devolvendo a resposta no formato do fabricante.
 *  2. Busca comandos pendentes da API (abrir catraca, cadastrar usuário/biometria) e executa.
 *  3. Mantém um cache das últimas decisões para operar se a internet cair.
 *
 * Fabricantes:
 *  - controlid: modo online da linha iDBlock/iDFlex/iDAccess (Control iD). A catraca é
 *    configurada para apontar o "servidor" para http://IP-DESTE-PC:PORTA. Endpoints e payloads
 *    seguem a documentação pública da Access API da Control iD; confira com a versão do
 *    firmware do seu equipamento antes de ir para produção.
 *  - simulador: lê linhas do teclado. Também funciona com leitor de QR USB, que "digita"
 *    o código e aperta Enter.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cfgPath = process.env.FM_BRIDGE_CONFIG || path.join(here, '..', 'config.json');
if (!fs.existsSync(cfgPath)) {
  console.error(`Config não encontrada em ${cfgPath}. Copie config.example.json para config.json e preencha.`);
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const API = cfg.api.replace(/\/$/, '');
const cachePath = path.join(here, '..', 'offline-cache.json');
let cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, 'utf8')) : {};
const saveCache = () => fs.writeFile(cachePath, JSON.stringify(cache), () => {});

const log = (dev, ...a) => console.log(new Date().toLocaleTimeString('pt-BR'), `[${dev.name || dev.host || 'catraca'}]`, ...a);

async function api(dev, method, p, body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), cfg.apiTimeoutMs ?? 2500);
  try {
    const r = await fetch(`${API}/api/bridge${p}`, {
      method,
      headers: { 'content-type': 'application/json', 'x-device-token': dev.token },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const j = await r.json();
    if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { status: r.status });
    return j;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Pergunta à API. Se ela não responder, aplica a política offline:
 *  - "cache" (padrão): libera quem foi liberado nas últimas `offlineCacheHours` horas
 *  - "liberar": libera todo mundo identificado pelo equipamento
 *  - "bloquear": não libera ninguém
 * A passagem offline não fica registrada na nuvem (limitação conhecida; ver README).
 */
async function decide(dev, { memberId, qr, method, direction }) {
  try {
    const d = await api(dev, 'POST', '/identify', { member_id: memberId, qr, method, direction });
    if (memberId) {
      cache[`${dev.token}:${memberId}`] = { granted: d.granted, at: Date.now(), name: d.member_name };
      saveCache();
    }
    return d;
  } catch (e) {
    if (e.status) return { granted: false, code: 'ERRO', message: e.message };
    const policy = cfg.offlinePolicy || 'cache';
    const c = memberId && cache[`${dev.token}:${memberId}`];
    const fresh = c && Date.now() - c.at < (cfg.offlineCacheHours ?? 48) * 3600_000;
    const granted = policy === 'liberar' || (policy === 'cache' && fresh && c.granted);
    log(dev, `API indisponível (${e.name}). Política offline "${policy}" -> ${granted ? 'libera' : 'bloqueia'}`);
    return { granted, code: 'OFFLINE', message: granted ? 'Bom treino!' : 'Procure a recepção', member_name: c?.name };
  }
}

// ---------------------------------------------------------------- Control iD
const controlid = {
  sessions: new Map(),

  async login(dev) {
    const r = await fetch(`http://${dev.host}/login.fcgi`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login: dev.login || 'admin', password: dev.password || 'admin' }),
    });
    const j = await r.json();
    if (!j.session) throw new Error('Login na catraca falhou');
    this.sessions.set(dev.host, j.session);
    return j.session;
  },

  async call(dev, endpoint, body, retry = true) {
    const session = this.sessions.get(dev.host) || (await this.login(dev));
    const r = await fetch(`http://${dev.host}/${endpoint}?session=${session}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.status === 401 && retry) {
      this.sessions.delete(dev.host);
      return this.call(dev, endpoint, body, false);
    }
    const text = await r.text();
    if (!r.ok) throw new Error(`${endpoint}: ${r.status} ${text}`);
    return text ? JSON.parse(text) : {};
  },

  /** Giro: "clockwise"/"anticlockwise" conforme o lado em que a catraca foi instalada. */
  turn(dev, direction) {
    const side = direction === 'saida' ? dev.exitRotation || 'anticlockwise' : dev.entryRotation || 'clockwise';
    return this.call(dev, 'execute_actions.fcgi', { actions: [{ action: 'catra', parameters: `allow=${side}` }] });
  },

  async enroll(dev, { member_id, name, kind }) {
    await this.call(dev, 'create_objects.fcgi', { object: 'users', values: [{ id: member_id, name, registration: String(member_id) }] }).catch((e) => {
      if (!/exist|UNIQUE|constraint/i.test(e.message)) throw e; // usuário já existe no equipamento
    });
    if (kind === 'digital' || kind === 'facial') {
      // Abre a captura no próprio equipamento; o template biométrico não sai da catraca.
      await this.call(dev, 'remote_enroll.fcgi', { type: kind === 'facial' ? 'face' : 'biometry', user_id: member_id, save: true, sync: false });
    }
  },
};

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      let data = {};
      try {
        data = JSON.parse(raw);
      } catch {
        data = Object.fromEntries(new URLSearchParams(raw));
      }
      resolve({ ...Object.fromEntries(new URL(req.url, 'http://x').searchParams), ...data });
    });
  });
}

/** Servidor que a catraca Control iD chama no modo online. */
function startControlIdServer(devices) {
  const byIp = new Map(devices.map((d) => [String(d.host).split(':')[0], d]));
  const server = http.createServer(async (req, res) => {
    const ip = (req.socket.remoteAddress || '').replace('::ffff:', '');
    const dev = byIp.get(ip) || (devices.length === 1 ? devices[0] : null);
    const url = req.url.split('?')[0];
    const send = (obj) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    if (!dev) {
      res.writeHead(403);
      return res.end();
    }
    const body = await readBody(req);

    if (url === '/device_is_alive.fcgi') return send({});

    if (url === '/new_user_identified.fcgi' || url === '/new_card.fcgi') {
      // user_id vem do cadastro feito via create_objects (= id do aluno no FitManager)
      const memberId = Number(body.user_id) || null;
      const method = url === '/new_card.fcgi' ? 'cartao' : body.identifier_id === 'face' || body.face ? 'facial' : 'digital';
      const direction = dev.direction === 'saida' ? 'saida' : 'entrada';
      const d = await decide(dev, { memberId, method, direction });
      log(dev, `${d.member_name || `id ${memberId}`}: ${d.granted ? 'LIBERADO' : 'NEGADO'} (${d.message})`);
      const side = direction === 'saida' ? dev.exitRotation || 'anticlockwise' : dev.entryRotation || 'clockwise';
      return send({
        result: {
          event: d.granted ? 7 : 6, // 7 = acesso concedido, 6 = acesso negado
          user_id: memberId || 0,
          user_name: d.member_name || '',
          user_image: false,
          portal_id: Number(body.portal_id) || 1,
          actions: d.granted ? [{ action: 'catra', parameters: `allow=${side}` }] : [],
          message: d.message,
        },
      });
    }

    // Notificações de giro/desistência (monitor). Hoje só registramos localmente.
    if (url.startsWith('/api/notifications')) {
      log(dev, 'evento', url, JSON.stringify(body).slice(0, 160));
      return send({});
    }

    send({});
  });
  server.listen(cfg.listenPort || 4000, () => console.log(`Bridge ouvindo catracas Control iD na porta ${cfg.listenPort || 4000}`));
}

// ---------------------------------------------------------------- Simulador
function startSimulator(dev) {
  console.log(`\nSimulador "${dev.name}": digite o ID do aluno (ou leia um QR do app) e Enter.`);
  console.log('Prefixos: "s 12" registra saída do aluno 12. "f 12" simula reconhecimento facial.\n');
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', async (line) => {
    const t = line.trim();
    if (!t) return;
    let direction = 'entrada';
    let method = 'digital';
    let v = t;
    if (/^s\s+/i.test(v)) (direction = 'saida'), (v = v.replace(/^s\s+/i, ''));
    if (/^f\s+/i.test(v)) (method = 'facial'), (v = v.replace(/^f\s+/i, ''));
    const isQR = v.startsWith('FM1.');
    const d = await decide(dev, { memberId: isQR ? null : Number(v), qr: isQR ? v : undefined, method: isQR ? 'qrcode' : method, direction });
    const bar = d.granted ? '\x1b[42m\x1b[30m LIBERADO \x1b[0m' : '\x1b[41m\x1b[37m BLOQUEADO \x1b[0m';
    console.log(`${bar} ${d.member_name || ''}  ${d.message}`);
  });
}

// ---------------------------------------------------------------- Comandos da nuvem
async function pollCommands(dev) {
  try {
    const cmds = await api(dev, 'GET', '/commands');
    for (const c of cmds) {
      try {
        if (dev.vendor === 'controlid') {
          if (c.action === 'open') await controlid.turn(dev, c.payload?.direction);
          if (c.action === 'enroll') await controlid.enroll(dev, c.payload);
        } else {
          log(dev, `comando ${c.action}`, c.payload ? JSON.stringify(c.payload) : '');
        }
        await api(dev, 'POST', `/commands/${c.id}/done`);
        log(dev, `comando ${c.action} executado`);
      } catch (e) {
        log(dev, `falha no comando ${c.action}: ${e.message} (nova tentativa no próximo ciclo)`);
      }
    }
  } catch (e) {
    if (e.status === 401) log(dev, 'token recusado pela API. Confira o token em Painel > Catracas.');
  }
}

async function main() {
  const devices = cfg.devices || [];
  if (!devices.length) throw new Error('Nenhuma catraca em config.json');
  for (const dev of devices) {
    try {
      const hb = await api(dev, 'POST', '/heartbeat');
      Object.assign(dev, { name: dev.name || hb.device.name, direction: hb.device.direction });
      log(dev, `conectada à API (${hb.device.direction})`);
    } catch (e) {
      log(dev, `não consegui falar com a API: ${e.message}`);
    }
    setInterval(() => api(dev, 'POST', '/heartbeat').catch(() => {}), 30_000);
    setInterval(() => pollCommands(dev), cfg.pollMs ?? 2000);
  }
  const cid = devices.filter((d) => d.vendor === 'controlid');
  if (cid.length) startControlIdServer(cid);
  const sim = devices.find((d) => d.vendor === 'simulador');
  if (sim) startSimulator(sim);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
