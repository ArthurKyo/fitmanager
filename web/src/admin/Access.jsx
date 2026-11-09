import { useEffect, useState } from 'react';
import { get, getSession, post, ApiError } from '../api.js';
import { useData, Loading, ErrorBox, Modal, useToast, Icon } from '../ui/kit.jsx';
import { time, METHOD, todayStr, date } from '../ui/format.js';
import { useLiveAccess } from './Layout.jsx';
import { Pass } from './Overview.jsx';

/** Busca de aluno com autocomplete. */
export function MemberPicker({ value, onChange, autoFocus }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (!q || value?.name === q) return setItems([]);
    const t = setTimeout(() => get(`/members?limit=8&q=${encodeURIComponent(q)}`).then((r) => setItems(r.items)), 200);
    return () => clearTimeout(t);
  }, [q, value]);
  return (
    <div style={{ position: 'relative' }}>
      <input
        className="input"
        placeholder="Nome, CPF ou telefone"
        autoFocus={autoFocus}
        value={value ? value.name : q}
        onChange={(e) => {
          onChange(null);
          setQ(e.target.value);
        }}
        aria-label="Buscar aluno"
      />
      {items.length > 0 && !value && (
        <div className="panel" style={{ position: 'absolute', top: 42, left: 0, right: 0, zIndex: 5, maxHeight: 260, overflow: 'auto' }}>
          {items.map((m) => (
            <button
              key={m.id}
              type="button"
              className="btn ghost"
              style={{ width: '100%', justifyContent: 'space-between', borderRadius: 0, height: 44 }}
              onClick={() => {
                onChange(m);
                setQ(m.name);
                setItems([]);
              }}
            >
              <span>{m.name}</span>
              <span className="tiny faint">{m.situation_label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Simulator({ devices }) {
  const sims = devices.filter((d) => d.active);
  const [deviceId, setDeviceId] = useState(sims.find((d) => d.vendor === 'simulador')?.id || sims[0]?.id);
  const [member, setMember] = useState(null);
  const [method, setMethod] = useState('digital');
  const [direction, setDirection] = useState('entrada');
  const [res, setRes] = useState(null);
  const [n, setN] = useState(0);
  const dev = devices.find((d) => d.id === Number(deviceId));

  async function fire() {
    const r = await post('/access/simulate', { device_id: Number(deviceId), member_id: member?.id, method, direction: dev?.direction === 'ambos' ? direction : undefined });
    setRes(r);
    setN((x) => x + 1);
  }

  return (
    <section className="panel panel-pad stack">
      <div>
        <h3>Simulador de catraca</h3>
        <p className="small muted">Passa pelo mesmo motor de regras da catraca física. Serve para treinar a recepção e testar planos novos.</p>
      </div>
      <div className="grid-2">
        <label className="field">
          <span>Equipamento</span>
          <select className="select" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
            {sims.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Aluno</span>
          <MemberPicker value={member} onChange={setMember} />
        </label>
      </div>
      <div className="row wrap">
        {['digital', 'facial', 'cartao'].map((k) => (
          <label key={k} className="check" style={{ alignItems: 'center' }}>
            <input type="radio" checked={method === k} onChange={() => setMethod(k)} /> {METHOD[k]}
          </label>
        ))}
        {dev?.direction === 'ambos' && (
          <select className="select" style={{ width: 'auto', marginLeft: 'auto' }} value={direction} onChange={(e) => setDirection(e.target.value)}>
            <option value="entrada">Entrada</option>
            <option value="saida">Saída</option>
          </select>
        )}
      </div>
      <button className="btn primary lg" onClick={fire} disabled={!member}>
        Passar {METHOD[method].toLowerCase()}
      </button>
      {res && (
        <div className="turnstile" style={{ padding: 14, borderRadius: 14 }}>
          <div className="ts-screen" style={{ minHeight: 0, padding: 18 }}>
            <div key={n} className="ts-swap">
              <div className={`ts-status ${res.granted ? 'ok' : 'no'}`} style={{ fontSize: 30 }}>
                {res.granted ? (res.direction === 'saida' ? 'Saída' : 'Liberado') : 'Bloqueado'}
              </div>
              <div className="ts-name" style={{ fontSize: 17 }}>
                {res.member_name}
              </div>
              <div className="ts-msg">{res.message}</div>
            </div>
            <div className="ts-meta">
              <span>{res.device_name}</span>
              <span>
                {METHOD[res.method]}, {time(res.created_at)}
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ManualRelease({ devices }) {
  const toast = useToast();
  const [member, setMember] = useState(null);
  const [deviceId, setDeviceId] = useState(devices.find((d) => d.direction !== 'saida' && d.vendor === 'controlid')?.id || '');
  const [need, setNeed] = useState(null);
  const [reason, setReason] = useState('');
  async function release() {
    try {
      const r = await post('/access/manual', { member_id: member?.id, device_id: deviceId ? Number(deviceId) : undefined, reason: need ? reason : undefined });
      toast(deviceId ? 'Comando enviado: catraca vai girar' : 'Entrada registrada');
      setMember(null);
      setNeed(null);
      setReason('');
      return r;
    } catch (e) {
      if (e instanceof ApiError && e.body?.code) setNeed(e.message);
      else toast(e.message, 'err');
    }
  }
  return (
    <section className="panel panel-pad stack">
      <div>
        <h3>Liberar na recepção</h3>
        <p className="small muted">Se as regras bloqueariam o aluno, você precisa justificar. Fica registrado com o seu nome.</p>
      </div>
      <MemberPicker value={member} onChange={(m) => (setMember(m), setNeed(null))} />
      <label className="field">
        <span>Girar a catraca</span>
        <select className="select" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
          <option value="">Não girar, só registrar a entrada</option>
          {devices
            .filter((d) => d.vendor === 'controlid' && d.active)
            .map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
        </select>
      </label>
      {need && (
        <>
          <div className="alert yellow">{need}</div>
          <input className="input" placeholder="Ex.: pagou em dinheiro agora, comprovante pendente" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </>
      )}
      <button className="btn" onClick={release} disabled={!member || (need && reason.trim().length < 4)}>
        {need ? 'Liberar mesmo assim' : 'Liberar entrada'}
      </button>
    </section>
  );
}

function DeviceModal({ onClose, onDone }) {
  const toast = useToast();
  const [v, setV] = useState({ name: '', vendor: 'controlid', host: '', direction: 'entrada' });
  const [err, setErr] = useState('');
  const b = (k) => ({ value: v[k], onChange: (e) => setV({ ...v, [k]: e.target.value }) });
  async function submit(e) {
    e.preventDefault();
    try {
      await post('/access/devices', v);
      toast('Catraca cadastrada. Copie o token para o bridge.');
      onDone();
    } catch (ex) {
      setErr(ex.message);
    }
  }
  return (
    <Modal title="Nova catraca" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span>Nome</span>
          <input className="input" required placeholder="Catraca 3, entrada lateral" {...b('name')} />
        </label>
        <div className="grid-2">
          <label className="field">
            <span>Fabricante</span>
            <select className="select" {...b('vendor')}>
              <option value="controlid">Control iD (modo online)</option>
              <option value="simulador">Simulador / leitor QR USB</option>
            </select>
          </label>
          <label className="field">
            <span>Sentido</span>
            <select className="select" {...b('direction')}>
              <option value="entrada">Só entrada</option>
              <option value="saida">Só saída</option>
              <option value="ambos">Entrada e saída</option>
            </select>
          </label>
        </div>
        {v.vendor === 'controlid' && (
          <label className="field">
            <span>IP na rede local</span>
            <input className="input" placeholder="192.168.0.52" {...b('host')} />
          </label>
        )}
        {err && <div className="alert red">{err}</div>}
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>
            Voltar
          </button>
          <button className="btn primary">Cadastrar</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Access() {
  const role = getSession().user.role;
  const devs = useData('/access/devices');
  const [day, setDay] = useState(todayStr());
  const [onlyDenied, setOnlyDenied] = useState(false);
  const logs = useData(`/access/logs?date=${day}${onlyDenied ? '&granted=0' : ''}`);
  const [extra, setExtra] = useState([]);
  const [showDev, setShowDev] = useState(false);
  const [showToken, setShowToken] = useState(null);
  useEffect(() => setExtra([]), [logs.data]);
  const online = useLiveAccess((ev) => {
    if (day === todayStr() && (!onlyDenied || !ev.granted)) setExtra((x) => [ev, ...x]);
  });

  if (devs.error) return <ErrorBox error={devs.error} retry={devs.reload} />;
  if (!devs.data) return <Loading />;
  const items = [...extra, ...(logs.data?.items || [])];

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Catraca</h1>
          <p>{logs.data ? `${logs.data.inside} pessoas dentro agora` : ' '}</p>
        </div>
        {role === 'dono' && (
          <button className="btn" onClick={() => setShowDev(true)}>
            <Icon name="plus" /> Nova catraca
          </button>
        )}
      </div>

      <section className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Equipamento</th>
                <th>Sentido</th>
                <th className="hide-sm">Endereço</th>
                <th>Conexão</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {devs.data.map((d) => (
                <tr key={d.id}>
                  <td>
                    <b>{d.name}</b>
                    <div className="tiny faint">{d.vendor === 'controlid' ? 'Control iD, modo online' : 'Simulador / leitor QR'}</div>
                  </td>
                  <td>{{ entrada: 'Entrada', saida: 'Saída', ambos: 'Entrada e saída' }[d.direction]}</td>
                  <td className="hide-sm tnum">{d.host || '—'}</td>
                  <td>
                    <span className={`tag ${d.online ? 'green' : ''}`}>{d.online ? 'Online' : d.last_seen ? `Visto ${date(d.last_seen)} ${time(d.last_seen)}` : 'Nunca conectou'}</span>
                    {d.pending_commands > 0 && <div className="tiny faint">{d.pending_commands} comando(s) na fila</div>}
                  </td>
                  <td className="right">
                    {role === 'dono' && (
                      <button className="btn sm" onClick={() => setShowToken(d)}>
                        Token do bridge
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {role !== 'professor' && (
        <div className="split">
          <Simulator devices={devs.data} />
          <ManualRelease devices={devs.data} />
        </div>
      )}

      <section className="panel">
        <div className="panel-head" style={{ flexWrap: 'wrap' }}>
          <h3>
            <span className={`live-dot ${online ? '' : 'off'}`} />
            Passagens
          </h3>
          <div className="row">
            <label className="check" style={{ alignItems: 'center' }}>
              <input type="checkbox" checked={onlyDenied} onChange={(e) => setOnlyDenied(e.target.checked)} /> Só bloqueios
            </label>
            <input className="input" type="date" style={{ width: 160 }} value={day} max={todayStr()} onChange={(e) => setDay(e.target.value)} />
          </div>
        </div>
        {!logs.data ? <Loading /> : items.length ? items.map((p) => <Pass key={p.id} p={{ ...p, granted: !!p.granted }} />) : <div className="empty">Nenhuma passagem neste dia.</div>}
      </section>

      {showDev && (
        <DeviceModal
          onClose={() => setShowDev(false)}
          onDone={() => {
            setShowDev(false);
            devs.reload();
          }}
        />
      )}
      {showToken && (
        <Modal title={`Token: ${showToken.name}`} sub="Cole em bridge/config.json, no PC da recepção ligado à mesma rede da catraca." onClose={() => setShowToken(null)}>
          <div className="pix-code">{showToken.token}</div>
          <p className="small muted">Quem tiver este token consegue registrar passagens nesta catraca. Não envie por canais públicos.</p>
        </Modal>
      )}
    </div>
  );
}
