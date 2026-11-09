import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getSession, post } from '../api.js';
import { useData, Loading, ErrorBox, Situation, Modal, useForm, useToast, Icon } from '../ui/kit.jsx';
import { cpf, phone, relDays, date, money, SITUATION, todayStr } from '../ui/format.js';

const FILTERS = ['', 'em_dia', 'vence_logo', 'vencido', 'bloqueado', 'trancado', 'sem_plano'];

export default function Members() {
  const [params, setParams] = useSearchParams();
  const situation = params.get('situation') || '';
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [showNew, setShowNew] = useState(params.get('novo') === '1');
  const nav = useNavigate();
  const role = getSession().user.role;
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  const { data, error, reload } = useData(`/members?limit=200&q=${encodeURIComponent(debounced)}&situation=${situation}`);

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Alunos</h1>
          <p>{data ? `${Object.values(data.counts).reduce((a, b) => a + b, 0)} cadastros ativos` : ' '}</p>
        </div>
        {role !== 'professor' && (
          <button className="btn primary" onClick={() => setShowNew(true)}>
            <Icon name="plus" /> Nova matrícula
          </button>
        )}
      </div>

      <div className="panel">
        <div className="panel-head" style={{ flexWrap: 'wrap' }}>
          <div className="row grow" style={{ minWidth: 240 }}>
            <Icon name="search" />
            <input className="input" style={{ border: 0, boxShadow: 'none', padding: 0 }} placeholder="Buscar por nome, CPF ou telefone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar aluno" />
          </div>
        </div>
        <div className="tabs" style={{ padding: '0 12px' }} role="tablist">
          {FILTERS.map((f) => (
            <button key={f} role="tab" aria-selected={situation === f} onClick={() => setParams(f ? { situation: f } : {})}>
              {f ? SITUATION[f].label : 'Todos'}
              {data && <span className="count">{f ? data.counts[f] || 0 : Object.values(data.counts).reduce((a, b) => a + b, 0)}</span>}
            </button>
          ))}
        </div>
        {error && <ErrorBox error={error} retry={reload} />}
        {!data ? (
          <Loading />
        ) : data.items.length === 0 ? (
          <div className="empty">
            <strong>Nenhum aluno aqui.</strong>
            {q ? 'Confira a grafia ou busque pelo CPF.' : 'Quando houver alunos nesta situação, eles aparecem nesta lista.'}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Aluno</th>
                  <th>Situação</th>
                  <th className="hide-sm">Plano</th>
                  <th className="hide-sm">Termina em</th>
                  <th>Última vez na catraca</th>
                  <th className="hide-sm">Telefone</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((m) => (
                  <tr key={m.id} className="click" onClick={() => nav(`/painel/alunos/${m.id}`)}>
                    <td>
                      <b>{m.name}</b>
                      <div className="tiny faint tnum">
                        {cpf(m.cpf)}, {m.age} anos
                      </div>
                    </td>
                    <td>
                      <Situation s={m.situation} label={m.situation_label} />
                    </td>
                    <td className="hide-sm">{m.plan_name || '—'}</td>
                    <td className="hide-sm tnum">{date(m.contract_end)}</td>
                    <td style={{ color: m.days_absent >= 10 ? 'var(--red)' : undefined }}>{m.last_visit ? relDays(m.last_visit) : 'nunca'}</td>
                    <td className="hide-sm tnum">{phone(m.phone)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {showNew && (
        <NewMember
          onClose={() => setShowNew(false)}
          onDone={(id) => {
            setShowNew(false);
            nav(`/painel/alunos/${id}`);
          }}
        />
      )}
    </div>
  );
}

export function NewMember({ onClose, onDone, lead }) {
  const toast = useToast();
  const { data: plans } = useData('/plans');
  const role = getSession().user.role;
  const [v, , bind] = useForm({
    name: lead?.name || '',
    cpf: '',
    birth_date: '',
    phone: lead?.phone || '',
    email: lead?.email || '',
    gender: '',
    guardian_name: '',
    guardian_cpf: '',
    medical_valid_until: '',
    plan_id: lead?.interest_plan_id || '',
    start_date: todayStr(),
    due_day: String(Math.min(28, new Date().getDate())),
    discount_pct: '0',
    source: lead?.source || 'balcao',
    lead_id: lead?.id,
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const age = v.birth_date ? Math.floor((Date.now() - new Date(`${v.birth_date}T12:00:00`)) / 31557600000) : null;
  const plan = plans?.find((p) => String(p.id) === String(v.plan_id));
  const monthly = plan ? Math.round(plan.price_cents * (1 - (Number(v.discount_pct) || 0) / 100)) : 0;
  const firstCharge = plan ? (plan.upfront ? monthly * plan.months : monthly) + plan.enrollment_fee_cents : 0;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const r = await post('/members', { ...v, plan_id: v.plan_id || undefined });
      toast('Matrícula criada');
      onDone(r.id);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Nova matrícula" sub="Cadastro e venda do plano. As cobranças são geradas na hora." onClose={onClose} wide>
      <form className="stack" onSubmit={submit}>
        <div className="grid-2">
          <label className="field">
            <span>Nome completo</span>
            <input className="input" required autoFocus {...bind('name')} />
          </label>
          <label className="field">
            <span>CPF</span>
            <input className="input" required inputMode="numeric" {...bind('cpf')} />
          </label>
        </div>
        <div className="grid-3">
          <label className="field">
            <span>Nascimento</span>
            <input className="input" type="date" required {...bind('birth_date')} />
          </label>
          <label className="field">
            <span>WhatsApp</span>
            <input className="input" required inputMode="tel" {...bind('phone')} />
          </label>
          <label className="field">
            <span>E-mail</span>
            <input className="input" type="email" {...bind('email')} />
          </label>
        </div>
        {age !== null && age < 18 && (
          <div className="grid-2">
            <label className="field">
              <span>Responsável legal</span>
              <input className="input" required {...bind('guardian_name')} />
            </label>
            <label className="field">
              <span>CPF do responsável</span>
              <input className="input" required inputMode="numeric" {...bind('guardian_cpf')} />
            </label>
          </div>
        )}
        <div className="grid-2">
          <label className="field">
            <span>Atestado médico válido até</span>
            <input className="input" type="date" {...bind('medical_valid_until')} />
            <small>Sem atestado a catraca não libera, se a academia exigir.</small>
          </label>
          <label className="field">
            <span>Como conheceu a academia</span>
            <select className="select" {...bind('source')}>
              <option value="balcao">Passou no balcão</option>
              <option value="indicacao">Indicação</option>
              <option value="instagram">Instagram</option>
              <option value="google">Google</option>
              <option value="site">Site</option>
              <option value="gympass">Gympass / Wellhub</option>
            </select>
          </label>
        </div>

        <h3 style={{ marginTop: 6 }}>Plano</h3>
        <div className="grid-2">
          <label className="field">
            <span>Plano</span>
            <select className="select" {...bind('plan_id')}>
              <option value="">Só cadastrar, vender depois</option>
              {plans?.filter((p) => p.active).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}, {money(p.price_cents)}/mês
                </option>
              ))}
            </select>
          </label>
          {plan && (
            <div className="grid-3">
              <label className="field">
                <span>Início</span>
                <input className="input" type="date" {...bind('start_date')} />
              </label>
              <label className="field">
                <span>Vencimento</span>
                <input className="input" type="number" min="1" max="28" {...bind('due_day')} />
              </label>
              <label className="field">
                <span>Desconto %</span>
                <input className="input" type="number" min="0" max={role === 'dono' ? 100 : 10} {...bind('discount_pct')} />
              </label>
            </div>
          )}
        </div>
        {plan && (
          <div className="alert blue">
            {plan.months} {plan.months > 1 ? 'meses' : 'mês'} a {money(monthly)}
            {plan.upfront ? ', pagamento único' : '/mês'}
            {plan.enrollment_fee_cents ? ` + matrícula de ${money(plan.enrollment_fee_cents)}` : ''}. Cobrança de hoje: <b>{money(firstCharge)}</b>.
            {plan.fidelity ? ` Fidelidade com multa de ${plan.cancel_fine_pct}% sobre o restante em caso de cancelamento.` : ''}
            {plan.hour_end - plan.hour_start < 24 ? ` Acesso das ${plan.hour_start}h às ${plan.hour_end}h.` : ''}
          </div>
        )}
        {err && <div className="alert red">{err}</div>}
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? 'Salvando…' : plan ? 'Matricular' : 'Cadastrar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
