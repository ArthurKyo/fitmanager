import { useState } from 'react';
import { getSession, post, put } from '../api.js';
import { useData, Loading, ErrorBox, Modal, useToast, Icon } from '../ui/kit.jsx';
import { money, WEEK } from '../ui/format.js';

const EMPTY = { name: '', months: 1, price: '149,90', upfront: false, fee: '0', fidelity: false, cancel_fine_pct: 0, max_daily_entries: 2, hour_start: 0, hour_end: 24, weekdays: '0123456', freeze_days: 0, active: true };
const toCents = (s) => Math.round(Number(String(s).replace(/\./g, '').replace(',', '.')) * 100);
const fromCents = (c) => (c / 100).toFixed(2).replace('.', ',');

function PlanModal({ plan, onClose, onDone }) {
  const toast = useToast();
  const [v, setV] = useState(plan ? { ...plan, price: fromCents(plan.price_cents), fee: fromCents(plan.enrollment_fee_cents), upfront: !!plan.upfront, fidelity: !!plan.fidelity, active: !!plan.active } : EMPTY);
  const [err, setErr] = useState('');
  const b = (k) => ({ value: v[k], onChange: (e) => setV({ ...v, [k]: e.target.value }) });
  const c = (k) => ({ checked: !!v[k], onChange: (e) => setV({ ...v, [k]: e.target.checked }) });
  const toggleDay = (d) => setV({ ...v, weekdays: v.weekdays.includes(d) ? v.weekdays.replace(d, '') : [...v.weekdays, d].sort().join('') });

  async function submit(e) {
    e.preventDefault();
    const body = {
      name: v.name,
      months: Number(v.months),
      price_cents: toCents(v.price),
      enrollment_fee_cents: toCents(v.fee || 0),
      upfront: v.upfront ? 1 : 0,
      fidelity: v.fidelity ? 1 : 0,
      cancel_fine_pct: v.fidelity ? Number(v.cancel_fine_pct) : 0,
      max_daily_entries: Number(v.max_daily_entries),
      hour_start: Number(v.hour_start),
      hour_end: Number(v.hour_end),
      weekdays: v.weekdays,
      freeze_days: Number(v.freeze_days),
      active: v.active ? 1 : 0,
    };
    try {
      if (plan) await put(`/plans/${plan.id}`, body);
      else await post('/plans', body);
      toast('Plano salvo');
      onDone();
    } catch (ex) {
      setErr(ex.message);
    }
  }

  return (
    <Modal title={plan ? `Editar ${plan.name}` : 'Novo plano'} sub={plan ? 'Mudanças valem para novas vendas. Contratos já vendidos mantêm o valor.' : null} onClose={onClose} wide>
      <form className="stack" onSubmit={submit}>
        <div className="grid-3">
          <label className="field">
            <span>Nome</span>
            <input className="input" required {...b('name')} />
          </label>
          <label className="field">
            <span>Duração (meses)</span>
            <input className="input" type="number" min="1" max="24" {...b('months')} />
          </label>
          <label className="field">
            <span>Valor mensal (R$)</span>
            <input className="input" inputMode="decimal" {...b('price')} />
          </label>
        </div>
        <div className="grid-3">
          <label className="field">
            <span>Taxa de matrícula (R$)</span>
            <input className="input" inputMode="decimal" {...b('fee')} />
            <small>Cobrada só na primeira matrícula do aluno.</small>
          </label>
          <label className="field">
            <span>Dias de trancamento</span>
            <input className="input" type="number" min="0" {...b('freeze_days')} />
          </label>
          <label className="field">
            <span>Entradas por dia</span>
            <input className="input" type="number" min="0" {...b('max_daily_entries')} />
            <small>0 = sem limite.</small>
          </label>
        </div>
        <div className="row wrap" style={{ gap: 20 }}>
          <label className="check">
            <input type="checkbox" {...c('upfront')} /> Pagamento único (à vista)
          </label>
          <label className="check">
            <input type="checkbox" {...c('fidelity')} /> Fidelidade
          </label>
          {v.fidelity && (
            <label className="row small">
              multa de
              <input className="input" style={{ width: 70 }} type="number" min="0" max="50" {...b('cancel_fine_pct')} />% sobre o restante
            </label>
          )}
          <label className="check">
            <input type="checkbox" {...c('active')} /> À venda
          </label>
        </div>
        <div className="grid-2">
          <div className="field">
            <span>Dias liberados</span>
            <div className="row wrap" style={{ gap: 6 }}>
              {WEEK.map((w, i) => (
                <button type="button" key={w} className={`btn sm ${v.weekdays.includes(String(i)) ? 'primary' : ''}`} onClick={() => toggleDay(String(i))} aria-pressed={v.weekdays.includes(String(i))}>
                  {w}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>Horário liberado</span>
            <div className="row">
              <input className="input" type="number" min="0" max="23" style={{ width: 80 }} {...b('hour_start')} />
              <span className="muted">às</span>
              <input className="input" type="number" min="1" max="24" style={{ width: 80 }} {...b('hour_end')} />
              <span className="muted">h</span>
            </div>
          </div>
        </div>
        {err && <div className="alert red">{err}</div>}
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>
            Voltar
          </button>
          <button className="btn primary">Salvar plano</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Plans() {
  const { data, error, reload } = useData('/plans');
  const [edit, setEdit] = useState(null);
  const isOwner = getSession().user.role === 'dono';
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Loading />;
  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Planos</h1>
          <p>As regras de cada plano são aplicadas pela catraca e pelo financeiro.</p>
        </div>
        {isOwner && (
          <button className="btn primary" onClick={() => setEdit({})}>
            <Icon name="plus" /> Novo plano
          </button>
        )}
      </div>
      <section className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Plano</th>
                <th className="right">Mensal</th>
                <th>Duração</th>
                <th className="hide-sm">Acesso</th>
                <th className="hide-sm">Regras</th>
                <th className="right">Ativos</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id} className={isOwner ? 'click' : ''} onClick={() => isOwner && setEdit(p)} style={{ opacity: p.active ? 1 : 0.55 }}>
                  <td>
                    <b>{p.name}</b>
                    {!p.active && <div className="tiny faint">fora de venda</div>}
                  </td>
                  <td className="right tnum">{money(p.price_cents)}</td>
                  <td>
                    {p.months} {p.months > 1 ? 'meses' : 'mês'}
                    {p.upfront ? ', à vista' : ''}
                  </td>
                  <td className="hide-sm small">
                    {p.weekdays === '0123456' ? 'Todos os dias' : p.weekdays.split('').map((d) => WEEK[d]).join(', ')}
                    {p.hour_end - p.hour_start < 24 ? `, ${p.hour_start}h às ${p.hour_end}h` : ''}
                  </td>
                  <td className="hide-sm small muted">
                    {[p.fidelity ? `fidelidade, multa ${p.cancel_fine_pct}%` : null, p.freeze_days ? `tranca ${p.freeze_days} dias` : null, p.enrollment_fee_cents ? `matrícula ${money(p.enrollment_fee_cents)}` : null, p.max_daily_entries ? `${p.max_daily_entries} entrada(s)/dia` : null].filter(Boolean).join('; ')}
                  </td>
                  <td className="right tnum">{p.active_contracts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {edit && (
        <PlanModal
          plan={edit.id ? edit : null}
          onClose={() => setEdit(null)}
          onDone={() => {
            setEdit(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
