import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getSession } from '../api.js';
import { useData, Loading, ErrorBox } from '../ui/kit.jsx';
import { money, date, PAY, whatsapp, firstName } from '../ui/format.js';
import { PayModal } from './MemberDetail.jsx';

const STATES = [
  ['', 'Tudo do mês'],
  ['pendente', 'A vencer'],
  ['vencido', 'Inadimplência'],
  ['pago', 'Pagas'],
];

function OnlineStrip() {
  const { data } = useData('/settings/payments');
  if (!data) return null;
  if (data.provider === 'manual')
    return (
      <div className="alert yellow spread">
        <span>Os pagamentos dependem de alguém dar baixa. Com recebimento online, o aluno paga no app e a catraca libera sozinha.</span>
        <Link className="btn sm" to="/painel/configuracoes?tab=recebimentos">
          Ativar recebimento online
        </Link>
      </div>
    );
  return (
    <div className="alert green spread">
      <span>
        Este mês entraram <b>{money(data.month.gross_cents)}</b> com baixa automática. Desse total, <b>{money(data.month.recovered_cents)}</b> eram faturas
        atrasadas e <b>{money(data.month.autopay_cents)}</b> vieram do débito automático (um pagamento pode estar nos dois).
      </span>
      <Link className="btn sm" to="/painel/configuracoes?tab=recebimentos">
        Recebimentos
      </Link>
    </div>
  );
}

export default function Finance() {
  const [params, setParams] = useSearchParams();
  const state = params.get('state') || '';
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [q, setQ] = useState('');
  const { data, error, reload } = useData(`/invoices?month=${month}&state=${state}&q=${encodeURIComponent(q)}`);
  const [paying, setPaying] = useState(null);
  const isOwner = getSession().user.role === 'dono';

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Financeiro</h1>
          <p>Mensalidades, matrículas, multas e avulsos.</p>
        </div>
        <input className="input" type="month" style={{ width: 170 }} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Mês" />
      </div>

      {data && isOwner && (
        <section className="panel kpis">
          <div>
            <span>Previsto no mês</span>
            <b className="num">{money(data.totals.expected_cents)}</b>
          </div>
          <div>
            <span>Recebido no mês</span>
            <b className="num" style={{ color: 'var(--green)' }}>
              {money(data.totals.received_cents)}
            </b>
          </div>
          <div>
            <span>A vencer</span>
            <b className="num">{money(data.totals.open_cents)}</b>
          </div>
          <div>
            <span>Vencido no mês</span>
            <b className="num" style={{ color: 'var(--red)' }}>
              {money(data.totals.overdue_cents)}
            </b>
          </div>
        </section>
      )}

      {isOwner && <OnlineStrip />}

      <section className="panel">
        <div className="tabs" style={{ padding: '0 12px' }}>
          {STATES.map(([k, l]) => (
            <button key={k} aria-selected={state === k} onClick={() => setParams(k ? { state: k } : {})}>
              {l}
            </button>
          ))}
          <input className="input" style={{ margin: '6px 0 6px auto', width: 220, height: 32 }} placeholder="Filtrar por aluno" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {state === 'vencido' && <div className="alert yellow" style={{ margin: 12 }}>Todas as faturas vencidas, de qualquer mês, com multa de 2% e juros de 1% ao mês já calculados.</div>}
        {error && <ErrorBox error={error} retry={reload} />}
        {!data ? (
          <Loading />
        ) : !data.items.length ? (
          <div className="empty">
            <strong>Nada por aqui.</strong>
            {state === 'vencido' ? 'Nenhuma fatura em atraso.' : 'Nenhuma fatura neste filtro.'}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Vencimento</th>
                  <th>Aluno</th>
                  <th className="hide-sm">Descrição</th>
                  <th>Situação</th>
                  <th className="right">Valor</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((i) => (
                  <tr key={i.id} style={{ opacity: i.state === 'cancelado' ? 0.5 : 1 }}>
                    <td className="tnum">{date(i.due_date)}</td>
                    <td>
                      <Link to={`/painel/alunos/${i.member_id}`}>{i.member_name}</Link>
                    </td>
                    <td className="hide-sm small">{i.description}</td>
                    <td>
                      <span className={`tag ${{ pago: 'green', vencido: 'red' }[i.state] || ''}`}>
                        {{ pago: `Pago, ${PAY[i.method] || ''}`, vencido: `${i.days_late} dias em atraso`, pendente: 'A vencer', cancelado: 'Cancelado' }[i.state]}
                      </span>
                    </td>
                    <td className="right tnum">{money(i.status === 'pago' ? i.paid_cents : i.due_cents)}</td>
                    <td className="right" style={{ whiteSpace: 'nowrap' }}>
                      {i.state === 'vencido' && (
                        <a className="btn sm ghost" href={whatsapp(i.phone, `Oi, ${firstName(i.member_name)}! Sua fatura de ${date(i.due_date)} está em aberto: ${money(i.due_cents)}. Dá para pagar pelo Pix no app da academia.`)} target="_blank" rel="noreferrer">
                          Cobrar
                        </a>
                      )}
                      {i.status === 'pendente' && (
                        <button className="btn sm" onClick={() => setPaying(i)}>
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
      </section>
      {paying && (
        <PayModal
          invoice={paying}
          onClose={() => setPaying(null)}
          onPaid={() => {
            setPaying(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
