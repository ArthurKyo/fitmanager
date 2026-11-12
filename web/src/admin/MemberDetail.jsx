import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BASE, get, getSession, post, put } from '../api.js';
import { useData, Loading, ErrorBox, Situation, Modal, useToast, QR, Icon } from '../ui/kit.jsx';
import { cpf, phone, date, money, time, dateShort, METHOD, PAY, whatsapp, firstName, todayStr, relDays } from '../ui/format.js';

const INV_TONE = { pago: 'green', vencido: 'red', pendente: '', cancelado: '' };
const INV_LABEL = { pago: 'Pago', vencido: 'Vencido', pendente: 'Em aberto', cancelado: 'Cancelado' };

export function PayModal({ invoice, onClose, onPaid }) {
  const toast = useToast();
  const [method, setMethod] = useState('pix');
  const [pix, setPix] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  // Com gateway ativo, o Pix do balcão tem baixa automática; sem gateway, cai no Pix estático.
  async function showPix() {
    setErr('');
    try {
      const c = await post(`/invoices/${invoice.id}/checkout`, { method: 'pix' });
      setPix({ payload: c.pix_payload, charge: c });
    } catch (e) {
      if (e.status !== 400 || !/não ativou/.test(e.message)) return setErr(e.message);
      try {
        setPix(await get(`/invoices/${invoice.id}/pix`));
      } catch (e2) {
        setErr(e2.message);
      }
    }
  }
  useEffect(() => {
    if (!pix?.charge) return;
    const t = setInterval(async () => {
      const list = await get(`/invoices/${invoice.id}/charges`).catch(() => []);
      if (list.some((c) => c.id === pix.charge.id && c.status === 'pago')) {
        clearInterval(t);
        toast(`Pix de ${money(pix.charge.amount_cents)} confirmado pelo banco`);
        onPaid();
      }
    }, 3000);
    return () => clearInterval(t);
  }, [pix, invoice.id, onPaid, toast]);
  async function pay() {
    setBusy(true);
    try {
      await post(`/invoices/${invoice.id}/pay`, { method });
      toast(`Pagamento de ${money(invoice.due_cents)} registrado`);
      onPaid();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Receber pagamento" sub={invoice.description} onClose={onClose}>
      <div className="spread">
        <span className="muted">Valor de face</span>
        <span className="tnum">{money(invoice.amount_cents)}</span>
      </div>
      {invoice.days_late > 0 && (
        <>
          <div className="spread small">
            <span className="muted">Multa de 2%</span>
            <span className="tnum">{money(invoice.fine_cents)}</span>
          </div>
          <div className="spread small">
            <span className="muted">Juros, {invoice.days_late} dias</span>
            <span className="tnum">{money(invoice.interest_cents)}</span>
          </div>
        </>
      )}
      <div className="spread" style={{ borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
        <b>Total</b>
        <b className="num" style={{ fontSize: 26 }}>
          {money(invoice.due_cents)}
        </b>
      </div>
      <div className="row wrap">
        {Object.entries(PAY).filter(([k]) => k !== 'boleto').map(([k, l]) => (
          <label key={k} className="check" style={{ alignItems: 'center' }}>
            <input type="radio" name="m" checked={method === k} onChange={() => setMethod(k)} /> {l}
          </label>
        ))}
      </div>
      {method === 'pix' && !pix && (
        <button className="btn" onClick={showPix}>
          Mostrar QR Pix para o aluno pagar
        </button>
      )}
      {pix && (
        <div className="stack" style={{ justifyItems: 'center' }}>
          <div className="qr-box">
            <QR value={pix.payload} size={200} />
          </div>
          <div className="pix-code" style={{ width: '100%' }}>
            {pix.payload}
          </div>
          {pix.charge ? (
            <>
              <p className="small muted row">
                <span className="live-dot" /> Aguardando o banco. A baixa é automática, não precisa clicar em confirmar.
              </p>
              {pix.charge.provider === 'simulado' && (
                <button className="btn sm" onClick={() => post(`/charges/${pix.charge.id}/simulate-paid`).catch((e) => setErr(e.message))}>
                  Simular pagamento do banco (modo de testes)
                </button>
              )}
            </>
          ) : (
            <p className="small muted">Confira o crédito na conta antes de confirmar. Ative o recebimento online em Configurações para a baixa ser automática.</p>
          )}
        </div>
      )}
      {err && <div className="alert red">{err}</div>}
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn go" onClick={pay} disabled={busy}>
          Confirmar recebimento
        </button>
      </div>
    </Modal>
  );
}

function FreezeModal({ contract, onClose, onDone }) {
  const toast = useToast();
  const left = contract.freeze_days - contract.freeze_used_days;
  const [days, setDays] = useState(Math.min(15, left));
  const [start, setStart] = useState(todayStr());
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault();
    try {
      const r = await post(`/contracts/${contract.id}/freeze`, { days: Number(days), start_date: start, reason });
      toast(`Trancado. Contrato vai até ${date(r.newEndDate)}`);
      onDone();
    } catch (ex) {
      setErr(ex.message);
    }
  }
  return (
    <Modal title="Trancar matrícula" sub={`Saldo do plano: ${left} dias. Mínimo de 7.`} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="grid-2">
          <label className="field">
            <span>A partir de</span>
            <input className="input" type="date" value={start} min={todayStr()} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="field">
            <span>Dias</span>
            <input className="input" type="number" min="7" max={left} value={days} onChange={(e) => setDays(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Motivo</span>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Viagem, cirurgia, férias…" />
        </label>
        <p className="small muted">O fim do contrato e os vencimentos seguintes andam {days || 0} dias. A catraca bloqueia durante o período.</p>
        {err && <div className="alert red">{err}</div>}
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>
            Voltar
          </button>
          <button className="btn primary">Trancar</button>
        </div>
      </form>
    </Modal>
  );
}

function CancelModal({ contract, onClose, onDone }) {
  const toast = useToast();
  const { data: p } = useData(`/contracts/${contract.id}/cancel-preview`);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault();
    try {
      const r = await post(`/contracts/${contract.id}/cancel`, { reason });
      toast(r.fineCents ? `Cancelado. Multa de ${money(r.fineCents)} gerada` : 'Contrato cancelado');
      onDone();
    } catch (ex) {
      setErr(ex.message);
    }
  }
  return (
    <Modal title="Cancelar contrato" sub={contract.plan_name} onClose={onClose}>
      {!p ? (
        <Loading />
      ) : (
        <form className="stack" onSubmit={submit}>
          <ul className="list-plain" style={{ margin: '0 -20px' }}>
            <li>
              <span>Parcelas futuras que serão canceladas</span>
              <b className="tnum">
                {p.futureInvoices} ({money(p.remainingCents)})
              </b>
            </li>
            <li>
              <span>Multa rescisória {p.finePct ? `(${p.finePct}%)` : ''}</span>
              <b className="tnum" style={{ color: p.fineCents ? 'var(--red)' : undefined }}>
                {p.fineCents ? money(p.fineCents) : 'sem multa'}
              </b>
            </li>
            <li>
              <span>Débitos já vencidos que continuam</span>
              <b className="tnum">{money(p.openDebtCents)}</b>
            </li>
          </ul>
          <label className="field">
            <span>Motivo do cancelamento</span>
            <select className="select" required value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Selecione</option>
              {['Mudou de cidade', 'Questões financeiras', 'Lesão / recomendação médica', 'Falta de tempo', 'Foi para academia concorrente', 'Insatisfeito com lotação no horário', 'Insatisfeito com atendimento', 'Outro'].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <small>Entra no relatório de evasão.</small>
          </label>
          {err && <div className="alert red">{err}</div>}
          <div className="modal-foot">
            <button type="button" className="btn" onClick={onClose}>
              Manter contrato
            </button>
            <button className="btn danger">Cancelar contrato</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function SellModal({ member, onClose, onDone, renewOf }) {
  const toast = useToast();
  const { data: plans } = useData('/plans');
  const [planId, setPlanId] = useState(renewOf?.plan_id || '');
  const [discount, setDiscount] = useState(0);
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault();
    try {
      if (renewOf) await post(`/contracts/${renewOf.id}/renew`, { plan_id: Number(planId) });
      else await post('/contracts', { member_id: member.id, plan_id: Number(planId), discount_pct: Number(discount) });
      toast(renewOf ? 'Renovação feita' : 'Plano vendido');
      onDone();
    } catch (ex) {
      setErr(ex.message);
    }
  }
  return (
    <Modal title={renewOf ? 'Renovar plano' : 'Vender plano'} sub={renewOf ? `Começa no dia seguinte ao fim do atual (${date(renewOf.end_date)})` : member.name} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span>Plano</span>
          <select className="select" required value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="">Selecione</option>
            {plans?.filter((p) => p.active).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}, {money(p.price_cents)}/mês
              </option>
            ))}
          </select>
        </label>
        {!renewOf && (
          <label className="field">
            <span>Desconto %</span>
            <input className="input" type="number" min="0" max="100" value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </label>
        )}
        {err && <div className="alert red">{err}</div>}
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>
            Voltar
          </button>
          <button className="btn primary">{renewOf ? 'Renovar' : 'Vender'}</button>
        </div>
      </form>
    </Modal>
  );
}

function CredentialModal({ member, onClose, onDone }) {
  const toast = useToast();
  const [kind, setKind] = useState('digital');
  const [label, setLabel] = useState('Indicador direito');
  const [consent, setConsent] = useState(false);
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault();
    try {
      const r = await post(`/members/${member.id}/credentials`, { kind, label: kind === 'digital' ? label : undefined, consent });
      toast(r.queuedDevices ? `Peça para o aluno ir até a catraca: captura enviada a ${r.queuedDevices} equipamento(s)` : 'Credencial registrada');
      onDone();
    } catch (ex) {
      setErr(ex.message);
    }
  }
  return (
    <Modal title="Cadastrar digital ou face" sub="A captura acontece no próprio equipamento. A biometria não sai da catraca." onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="row wrap">
          {[
            ['digital', 'Digital'],
            ['facial', 'Reconhecimento facial'],
            ['cartao', 'Cartão / chaveiro'],
          ].map(([k, l]) => (
            <label className="check" key={k} style={{ alignItems: 'center' }}>
              <input type="radio" checked={kind === k} onChange={() => setKind(k)} /> {l}
            </label>
          ))}
        </div>
        {kind === 'digital' && (
          <label className="field">
            <span>Dedo</span>
            <select className="select" value={label} onChange={(e) => setLabel(e.target.value)}>
              {['Indicador direito', 'Médio direito', 'Indicador esquerdo', 'Médio esquerdo', 'Polegar direito'].map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
        )}
        <label className="check">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>O aluno autorizou o uso da biometria apenas para controle de acesso (LGPD, art. 11).</span>
        </label>
        {err && <div className="alert red">{err}</div>}
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>
            Voltar
          </button>
          <button className="btn primary" disabled={!consent}>
            Enviar para a catraca
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditModal({ m, onClose, onDone }) {
  const toast = useToast();
  const [v, setV] = useState({ name: m.name, phone: m.phone, email: m.email || '', medical_valid_until: m.medical_valid_until || '', status: m.status, notes: m.notes || '' });
  const [err, setErr] = useState('');
  const b = (k) => ({ value: v[k] ?? '', onChange: (e) => setV({ ...v, [k]: e.target.value }) });
  async function submit(e) {
    e.preventDefault();
    try {
      await put(`/members/${m.id}`, v);
      toast('Cadastro atualizado');
      onDone();
    } catch (ex) {
      setErr(ex.message);
    }
  }
  return (
    <Modal title="Editar cadastro" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span>Nome</span>
          <input className="input" {...b('name')} />
        </label>
        <div className="grid-2">
          <label className="field">
            <span>WhatsApp</span>
            <input className="input" {...b('phone')} />
          </label>
          <label className="field">
            <span>E-mail</span>
            <input className="input" {...b('email')} />
          </label>
        </div>
        <div className="grid-2">
          <label className="field">
            <span>Atestado válido até</span>
            <input className="input" type="date" {...b('medical_valid_until')} />
          </label>
          <label className="field">
            <span>Cadastro</span>
            <select className="select" {...b('status')}>
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
          </label>
        </div>
        <label className="field">
          <span>Observações</span>
          <textarea className="textarea" {...b('notes')} placeholder="Restrições, lesões, preferências de horário…" />
        </label>
        {err && <div className="alert red">{err}</div>}
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>
            Voltar
          </button>
          <button className="btn primary">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

export default function MemberDetail() {
  const { id } = useParams();
  const { data: m, error, reload } = useData(`/members/${id}`);
  const [modal, setModal] = useState(null);
  const [tab, setTab] = useState('financeiro');
  const toast = useToast();
  const role = getSession().user.role;
  const canDesk = role !== 'professor';
  const close = () => setModal(null);
  const done = () => {
    setModal(null);
    reload();
  };

  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!m) return <Loading />;
  const active = m.contracts.find((c) => c.status === 'ativo' && c.start_date <= todayStr() && c.end_date >= todayStr());
  const open = m.invoices.filter((i) => i.state === 'vencido' || i.state === 'pendente');
  const debt = m.invoices.filter((i) => i.state === 'vencido');
  const debtTotal = debt.reduce((s, i) => s + i.due_cents, 0);

  async function appAccess() {
    try {
      const r = await post(`/members/${m.id}/app-access`, {});
      setModal({ kind: 'app', ...r });
      reload();
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <Link to="/painel/alunos" className="small">
            Alunos
          </Link>
          <h1 style={{ marginTop: 4 }}>{m.name}</h1>
          <div className="row wrap" style={{ marginTop: 8 }}>
            <Situation s={m.situation} label={m.situation_label} />
            <span className="small muted tnum">
              {cpf(m.cpf)}, {m.age} anos
            </span>
            {m.guardian_name && <span className="small muted">Responsável: {m.guardian_name}</span>}
          </div>
        </div>
        <div className="row wrap">
          <a className="btn" href={whatsapp(m.phone, `Oi, ${firstName(m.name)}!`)} target="_blank" rel="noreferrer">
            <Icon name="phone" /> {phone(m.phone)}
          </a>
          {canDesk && (
            <button className="btn" onClick={() => setModal({ kind: 'edit' })}>
              Editar
            </button>
          )}
        </div>
      </div>

      {debt.length > 0 && (
        <div className="alert red spread">
          <span>
            {debt.length} fatura(s) vencida(s), total com encargos de <b>{money(debtTotal)}</b>. Vencimento mais antigo em {date(debt.at(-1).due_date)}.
          </span>
          {canDesk && (
            <a className="btn sm" href={whatsapp(m.phone, `Oi, ${firstName(m.name)}! Aqui é da academia. Sua mensalidade está em aberto (${money(debtTotal)}). Pode pagar pelo Pix no app ou aqui na recepção.`)} target="_blank" rel="noreferrer">
              Cobrar no WhatsApp
            </a>
          )}
        </div>
      )}
      {m.medical_valid_until && m.medical_valid_until < todayStr() && <div className="alert yellow">Atestado médico venceu em {date(m.medical_valid_until)}. A catraca está bloqueando a entrada.</div>}

      <section className="panel kpis">
        <div>
          <span>Plano atual</span>
          <b style={{ display: 'block', fontSize: 17, marginTop: 2 }}>{active?.plan_name || 'Nenhum'}</b>
          <div className="note muted">{active ? `${date(active.start_date)} a ${date(active.end_date)}` : 'Venda um plano para liberar a catraca'}</div>
        </div>
        <div>
          <span>Mensalidade</span>
          <b className="num">{active ? money(active.monthly_cents) : '—'}</b>
          <div className="note muted">{active ? `vence todo dia ${active.due_day}` : ' '}</div>
        </div>
        <div>
          <span>Frequência, 30 dias</span>
          <b className="num">{m.visits30}</b>
          <div className="note muted">última: {m.last_visit ? relDays(m.last_visit) : 'nunca'}</div>
        </div>
        <div>
          <span>Em aberto</span>
          <b className="num">{money(open.reduce((s, i) => s + i.due_cents, 0))}</b>
          <div className="note muted">{open.length} fatura(s)</div>
        </div>
      </section>

      {canDesk && (
        <div className="row wrap">
          {!active && (
            <button className="btn primary" onClick={() => setModal({ kind: 'sell' })}>
              Vender plano
            </button>
          )}
          {active && (
            <button className="btn" onClick={() => setModal({ kind: 'renew', c: active })}>
              Renovar
            </button>
          )}
          {active && active.freeze_days > 0 && (
            <button className="btn" onClick={() => setModal({ kind: 'freeze', c: active })}>
              Trancar ({active.freeze_days - active.freeze_used_days} dias de saldo)
            </button>
          )}
          {active && (
            <button className="btn danger" onClick={() => setModal({ kind: 'cancel', c: active })}>
              Cancelar contrato
            </button>
          )}
          <button className="btn" onClick={() => setModal({ kind: 'cred' })}>
            Cadastrar digital ou face
          </button>
          <button className="btn" onClick={appAccess}>
            {m.app_login ? 'Gerar nova senha do app' : 'Liberar acesso ao app'}
          </button>
        </div>
      )}

      <div className="panel">
        <div className="tabs" style={{ padding: '0 12px' }}>
          {[
            ['financeiro', 'Faturas', m.invoices.length],
            ['catraca', 'Catraca', m.access.length],
            ['contratos', 'Contratos', m.contracts.length],
            ['treino', 'Treino e dieta', m.workouts.length + m.diets.length],
            ['acesso', 'Credenciais', m.credentials.length],
          ].map(([k, l, n]) => (
            <button key={k} aria-selected={tab === k} onClick={() => setTab(k)}>
              {l}
              <span className="count">{n}</span>
            </button>
          ))}
        </div>

        {tab === 'financeiro' && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Vencimento</th>
                  <th>Descrição</th>
                  <th>Situação</th>
                  <th className="right">Valor</th>
                  <th className="hide-sm">Pago em</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {m.invoices.map((i) => (
                  <tr key={i.id} style={{ opacity: i.state === 'cancelado' ? 0.5 : 1 }}>
                    <td className="tnum">{date(i.due_date)}</td>
                    <td>{i.description}</td>
                    <td>
                      <span className={`tag ${INV_TONE[i.state]}`}>
                        {INV_LABEL[i.state]}
                        {i.days_late > 0 ? `, ${i.days_late}d` : ''}
                      </span>
                    </td>
                    <td className="right tnum">{money(i.status === 'pago' ? i.paid_cents : i.due_cents)}</td>
                    <td className="hide-sm tnum small muted">{i.paid_at ? `${date(i.paid_at)}, ${PAY[i.method] || i.method}` : ''}</td>
                    <td className="right">
                      {canDesk && i.status === 'pendente' && (
                        <button className="btn sm" onClick={() => setModal({ kind: 'pay', i })}>
                          Receber
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'catraca' && (
          <div className="table-wrap">
            <table className="table">
              <tbody>
                {m.access.map((a) => (
                  <tr key={a.id}>
                    <td className="tnum" style={{ width: 120 }}>
                      {dateShort(a.created_at)} {time(a.created_at)}
                    </td>
                    <td>
                      <span className={`tag ${a.granted ? (a.direction === 'saida' ? '' : 'green') : 'red'}`}>{a.direction === 'saida' ? 'Saída' : a.label}</span>
                    </td>
                    <td className="small muted">{a.message}</td>
                    <td className="small muted hide-sm">
                      {METHOD[a.method]}, {a.device_name || 'recepção'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!m.access.length && <div className="empty">Ainda não passou na catraca.</div>}
          </div>
        )}

        {tab === 'contratos' && (
          <ul className="list-plain">
            {m.contracts.map((c) => (
              <li key={c.id}>
                <span>
                  <b>{c.plan_name}</b>{' '}
                  <span className="muted tnum">
                    {date(c.start_date)} a {date(c.end_date)}, {money(c.monthly_cents)}/mês
                  </span>
                  {c.freezes.map((f) => (
                    <div key={f.id} className="small muted">
                      Trancado de {date(f.start_date)} a {date(f.end_date)} {f.reason ? `(${f.reason})` : ''}
                    </div>
                  ))}
                  {c.cancel_reason && <div className="small muted">Motivo do cancelamento: {c.cancel_reason}</div>}
                </span>
                <span className={`tag ${c.status === 'ativo' ? 'green' : c.status === 'cancelado' ? 'red' : ''}`}>{c.status}</span>
              </li>
            ))}
          </ul>
        )}

        {tab === 'treino' && (
          <ul className="list-plain">
            {m.workouts.map((w) => (
              <li key={`w${w.id}`}>
                <Link to={`/painel/treinos?id=${w.id}`}>Ficha: {w.name}</Link>
                <span className="muted small">{w.active ? `válida até ${date(w.valid_until)}` : 'arquivada'}</span>
              </li>
            ))}
            {m.diets.map((d) => (
              <li key={`d${d.id}`}>
                <Link to={`/painel/dietas?id=${d.id}`}>Dieta: {d.name}</Link>
                <span className="muted small">{d.active ? `${d.kcal_target} kcal` : 'arquivada'}</span>
              </li>
            ))}
            {!m.workouts.length && !m.diets.length && (
              <div className="empty">
                Sem ficha nem dieta. <Link to={`/painel/treinos?novo=${m.id}`}>Montar ficha</Link>
              </div>
            )}
          </ul>
        )}

        {tab === 'acesso' && (
          <ul className="list-plain">
            {m.credentials.map((c) => (
              <li key={c.id}>
                <span>
                  {METHOD[c.kind]}: {c.label}
                </span>
                <span className="muted small">cadastrada em {date(c.enrolled_at)}</span>
              </li>
            ))}
            <li>
              <span>Cartão para débito automático</span>
              <span className="muted small">
                {m.payment_profile?.card_last4 ? `${m.payment_profile.card_brand} final ${m.payment_profile.card_last4}, ${m.payment_profile.autopay ? 'débito automático ligado' : 'débito automático desligado'}` : 'nenhum cartão salvo'}
              </span>
            </li>
            <li>
              <span>App do aluno</span>
              <span className="muted small">{m.app_login ? `login ${m.app_login.email}` : 'sem acesso'}</span>
            </li>
          </ul>
        )}
      </div>

      {modal?.kind === 'pay' && <PayModal invoice={modal.i} onClose={close} onPaid={done} />}
      {modal?.kind === 'freeze' && <FreezeModal contract={modal.c} onClose={close} onDone={done} />}
      {modal?.kind === 'cancel' && <CancelModal contract={modal.c} onClose={close} onDone={done} />}
      {modal?.kind === 'sell' && <SellModal member={m} onClose={close} onDone={done} />}
      {modal?.kind === 'renew' && <SellModal member={m} renewOf={modal.c} onClose={close} onDone={done} />}
      {modal?.kind === 'cred' && <CredentialModal member={m} onClose={close} onDone={done} />}
      {modal?.kind === 'edit' && <EditModal m={m} onClose={close} onDone={done} />}
      {modal?.kind === 'app' && (
        <Modal title="Acesso ao app criado" onClose={close}>
          <p>Passe estes dados para {firstName(m.name)}. A senha aparece só agora.</p>
          <ul className="list-plain" style={{ margin: '0 -20px' }}>
            <li>
              <span>Endereço</span>
              <b>{window.location.origin}{BASE}/app</b>
            </li>
            <li>
              <span>Login</span>
              <b>{modal.email}</b>
            </li>
            <li>
              <span>Senha provisória</span>
              <b className="tnum">{modal.temporaryPassword}</b>
            </li>
          </ul>
          <a className="btn primary" href={whatsapp(m.phone, `Seu acesso ao app da academia: ${window.location.origin}${BASE}/app\nLogin: ${modal.email}\nSenha: ${modal.temporaryPassword}`)} target="_blank" rel="noreferrer">
            Enviar pelo WhatsApp
          </a>
        </Modal>
      )}
    </div>
  );
}
