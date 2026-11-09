import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { post } from '../api.js';
import { useData, Loading, ErrorBox, Modal, useToast, useForm, Icon } from '../ui/kit.jsx';
import { phone, date, relDays, whatsapp, firstName, dateShort, todayStr } from '../ui/format.js';
import { NewMember } from './Members.jsx';

const STAGES = [
  ['novo', 'Novos'],
  ['contato', 'Em contato'],
  ['visita', 'Visitou'],
  ['experimental', 'Aula experimental'],
  ['negociacao', 'Negociando'],
];
const LOST = { preco: 'Preço', distancia: 'Distância', horario: 'Horário', concorrente: 'Foi para concorrente', sem_retorno: 'Parou de responder', desistiu: 'Desistiu', outro: 'Outro' };
const SOURCE = { instagram: 'Instagram', google: 'Google', indicacao: 'Indicação', site: 'Site', passou_na_frente: 'Passou na frente', balcao: 'Balcão' };
const EVENT = { criado: 'Lead criado', contato: 'Em contato', visita: 'Visitou a academia', experimental: 'Aula experimental', negociacao: 'Negociando', perdido: 'Perdido', matriculado: 'Matriculado', ligacao: 'Ligação', whatsapp: 'WhatsApp', nota: 'Anotação' };

function LeadModal({ id, onClose, onChange, onConvert }) {
  const toast = useToast();
  const { data: l, reload } = useData(`/crm/leads/${id}`);
  const [note, setNote] = useState('');
  const [kind, setKind] = useState('whatsapp');
  const [next, setNext] = useState('');
  const [lost, setLost] = useState('');
  const [err, setErr] = useState('');
  if (!l) return null;
  async function move(stage) {
    setErr('');
    try {
      await post(`/crm/leads/${id}/stage`, { stage, lost_reason: stage === 'perdido' ? lost : undefined, next_contact: next || undefined });
      toast('Lead atualizado');
      reload();
      onChange();
    } catch (e) {
      setErr(e.message);
    }
  }
  async function addNote(e) {
    e.preventDefault();
    try {
      await post(`/crm/leads/${id}/notes`, { note, kind, next_contact: next || undefined });
      setNote('');
      reload();
      onChange();
    } catch (ex) {
      setErr(ex.message);
    }
  }
  const closed = ['matriculado', 'perdido'].includes(l.stage);
  return (
    <Modal title={l.name} sub={`${phone(l.phone)}, origem ${SOURCE[l.source] || l.source}`} onClose={onClose} wide>
      <div className="row wrap">
        <a className="btn" href={whatsapp(l.phone, `Oi, ${firstName(l.name)}! Tudo bem? Aqui é da academia.`)} target="_blank" rel="noreferrer">
          Abrir WhatsApp
        </a>
        {!closed && (
          <button className="btn primary" onClick={() => onConvert(l)}>
            Converter em aluno
          </button>
        )}
        {l.member_id && <Link to={`/painel/alunos/${l.member_id}`}>Ver aluno</Link>}
      </div>
      {!closed && (
        <div className="stack">
          <div className="row wrap">
            <span className="small muted">Mover para</span>
            {STAGES.filter(([k]) => k !== l.stage).map(([k, t]) => (
              <button key={k} className="btn sm" onClick={() => move(k)}>
                {t}
              </button>
            ))}
          </div>
          <div className="row wrap">
            <select className="select" style={{ width: 220 }} value={lost} onChange={(e) => setLost(e.target.value)}>
              <option value="">Motivo da perda</option>
              {Object.entries(LOST).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <button className="btn sm danger" disabled={!lost} onClick={() => move('perdido')}>
              Marcar como perdido
            </button>
          </div>
        </div>
      )}
      <form className="stack" onSubmit={addNote} style={{ borderTop: '1px solid var(--rule-soft)', paddingTop: 14 }}>
        <div className="row wrap">
          <select className="select" style={{ width: 150 }} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="whatsapp">WhatsApp</option>
            <option value="ligacao">Ligação</option>
            <option value="nota">Anotação</option>
          </select>
          <input className="input grow" required placeholder="O que foi conversado" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="row wrap">
          <label className="small muted">Próximo contato</label>
          <input className="input" type="date" style={{ width: 170 }} min={todayStr()} value={next} onChange={(e) => setNext(e.target.value)} />
          <button className="btn">Registrar</button>
        </div>
      </form>
      {err && <div className="alert red">{err}</div>}
      <ul className="list-plain" style={{ margin: '0 -22px' }}>
        {l.events.map((e) => (
          <li key={e.id}>
            <span>
              <b>{EVENT[e.kind] || e.kind}</b> {e.note && <span className="muted">{e.note}</span>}
            </span>
            <span className="tiny faint" style={{ whiteSpace: 'nowrap' }}>
              {dateShort(e.created_at)} {e.user_name ? firstName(e.user_name) : ''}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

function NewLead({ onClose, onDone }) {
  const { data: plans } = useData('/plans');
  const [v, , bind] = useForm({ name: '', phone: '', email: '', source: 'instagram', interest_plan_id: '', next_contact: todayStr(), note: '' });
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault();
    try {
      await post('/crm/leads', { ...v, interest_plan_id: v.interest_plan_id || undefined });
      onDone();
    } catch (ex) {
      setErr(ex.message);
    }
  }
  return (
    <Modal title="Novo lead" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="grid-2">
          <label className="field">
            <span>Nome</span>
            <input className="input" required autoFocus {...bind('name')} />
          </label>
          <label className="field">
            <span>WhatsApp</span>
            <input className="input" required {...bind('phone')} />
          </label>
        </div>
        <div className="grid-2">
          <label className="field">
            <span>Origem</span>
            <select className="select" {...bind('source')}>
              {Object.entries(SOURCE).map(([k, s]) => (
                <option key={k} value={k}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Plano de interesse</span>
            <select className="select" {...bind('interest_plan_id')}>
              <option value="">Ainda não sabe</option>
              {plans?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Observação</span>
          <input className="input" {...bind('note')} placeholder="Quer treinar de manhã, tem dor no joelho…" />
        </label>
        {err && <div className="alert red">{err}</div>}
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>
            Voltar
          </button>
          <button className="btn primary">Cadastrar lead</button>
        </div>
      </form>
    </Modal>
  );
}

function Pipeline() {
  const toast = useToast();
  const { data, error, reload } = useData('/crm/leads');
  const [open, setOpen] = useState(null);
  const [convert, setConvert] = useState(null);
  const [add, setAdd] = useState(false);
  const [over, setOver] = useState(null);
  const nav = useNavigate();
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Loading />;

  async function drop(stage, leadId) {
    setOver(null);
    try {
      await post(`/crm/leads/${leadId}/stage`, { stage });
      reload();
    } catch (e) {
      toast(e.message, 'err');
    }
  }
  const lost = data.filter((l) => l.stage === 'perdido');
  const won = data.filter((l) => l.stage === 'matriculado');

  return (
    <>
      <div className="spread">
        <p className="small muted">
          Arraste o cartão para mudar de etapa. Últimos 30 dias: {won.length} matriculados, {lost.length} perdidos.
        </p>
        <button className="btn primary" onClick={() => setAdd(true)}>
          <Icon name="plus" /> Novo lead
        </button>
      </div>
      <div className="board">
        {STAGES.map(([k, t]) => {
          const items = data.filter((l) => l.stage === k);
          return (
            <div
              key={k}
              className={`col ${over === k ? 'drop' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(k);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => drop(k, e.dataTransfer.getData('text/plain'))}
            >
              <div className="col-head">
                <span>{t}</span>
                <span className="faint">{items.length}</span>
              </div>
              {items.map((l) => (
                <button key={l.id} className={`lead ${l.overdue_contact ? 'late' : ''}`} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', l.id)} onClick={() => setOpen(l.id)}>
                  <b style={{ fontSize: 14 }}>{l.name}</b>
                  <span className="tiny muted">
                    {SOURCE[l.source] || l.source}
                    {l.plan_name ? `, quer ${l.plan_name}` : ''}
                  </span>
                  {l.next_contact && (
                    <span className="tiny" style={{ color: l.overdue_contact ? 'var(--red)' : 'var(--ink-3)' }}>
                      Retorno {relDays(l.next_contact)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          );
        })}
      </div>
      {open && <LeadModal id={open} onClose={() => setOpen(null)} onChange={reload} onConvert={(l) => (setOpen(null), setConvert(l))} />}
      {convert && <NewMember lead={convert} onClose={() => setConvert(null)} onDone={(id) => nav(`/painel/alunos/${id}`)} />}
      {add && (
        <NewLead
          onClose={() => setAdd(false)}
          onDone={() => {
            setAdd(false);
            reload();
          }}
        />
      )}
    </>
  );
}

function Retention() {
  const { data, error, reload } = useData('/crm/retention');
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Loading />;
  return (
    <div className="stack-lg">
      <div className="split">
        <section className="panel">
          <div className="panel-head">
            <h3>Sumiram da academia</h3>
            <span className="small muted">plano ativo, 10+ dias sem catraca</span>
          </div>
          {data.risk.length ? (
            <ul className="list-plain">
              {data.risk.slice(0, 25).map((m) => (
                <li key={m.id}>
                  <Link to={`/painel/alunos/${m.id}`}>{m.name}</Link>
                  <span className="row">
                    <span className="small" style={{ color: 'var(--red)' }}>
                      {m.days_absent === null ? 'nunca veio' : `${m.days_absent} dias`}
                    </span>
                    <a className="btn sm ghost" href={whatsapp(m.phone, `Oi, ${firstName(m.name)}! Sentimos sua falta por aqui. Bora voltar essa semana? Se quiser, o professor ajusta seu treino.`)} target="_blank" rel="noreferrer">
                      Chamar
                    </a>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">Todo mundo apareceu nos últimos 10 dias.</div>
          )}
        </section>
        <section className="panel">
          <div className="panel-head">
            <h3>Plano termina em até 30 dias</h3>
            <span className="small muted">sem renovação feita</span>
          </div>
          <ul className="list-plain">
            {data.renewals.slice(0, 25).map((r) => (
              <li key={r.contract_id}>
                <Link to={`/painel/alunos/${r.id}`}>{r.name}</Link>
                <span className="small muted">
                  {r.plan_name}, {date(r.end_date)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <div className="split">
        <section className="panel">
          <div className="panel-head">
            <h3>Aniversariantes do mês</h3>
          </div>
          <ul className="list-plain">
            {data.birthdays.map((b) => (
              <li key={b.id}>
                <Link to={`/painel/alunos/${b.id}`}>{b.name}</Link>
                <span className="small muted tnum">{dateShort(b.birth_date)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h3>Por que cancelaram</h3>
            <span className="small muted">últimos 90 dias</span>
          </div>
          {data.cancelled.length ? (
            <ul className="list-plain">
              {data.cancelled.map((c) => (
                <li key={c.cancel_reason}>
                  <span>{c.cancel_reason}</span>
                  <b className="tnum">{c.n}</b>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">Nenhum cancelamento.</div>
          )}
        </section>
      </div>
    </div>
  );
}

export default function CRM() {
  const [tab, setTab] = useState('funil');
  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>CRM</h1>
          <p>Quem ainda não é aluno e quem corre o risco de deixar de ser.</p>
        </div>
      </div>
      <div className="tabs">
        <button aria-selected={tab === 'funil'} onClick={() => setTab('funil')}>
          Funil de vendas
        </button>
        <button aria-selected={tab === 'retencao'} onClick={() => setTab('retencao')}>
          Retenção
        </button>
      </div>
      {tab === 'funil' ? <Pipeline /> : <Retention />}
    </div>
  );
}
