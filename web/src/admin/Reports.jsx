import { useData, Loading, ErrorBox } from '../ui/kit.jsx';
import { money, moneyShort, pct, PAY, WEEK } from '../ui/format.js';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function RevenueChart({ months }) {
  const max = Math.max(1, ...months.map((m) => Math.max(m.received_cents, m.expected_cents)));
  return (
    <div>
      <div className="hours" style={{ '--cols': months.length, height: 180 }}>
        {months.map((m) => (
          <div key={m.month} className="h" title={`${m.month}: recebido ${money(m.received_cents)}, previsto ${money(m.expected_cents)}`}>
            <div className="bar" style={{ height: `${(m.received_cents / max) * 100}%` }} />
            <span className="base" style={{ bottom: `${(m.expected_cents / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="hours-axis" style={{ '--cols': months.length }}>
        {months.map((m) => (
          <span key={m.month}>{MONTHS[Number(m.month.slice(5)) - 1]}</span>
        ))}
      </div>
    </div>
  );
}

export default function Reports() {
  const { data, error, reload } = useData('/dashboard/reports');
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Loading />;
  const totalMethods = data.methods.reduce((s, m) => s + m.v, 0);
  const wdMax = Math.max(1, ...data.weekday.map((w) => w.avg));
  const closed = data.months.slice(0, -1);
  const avgLate = closed.reduce((s, m) => s + m.late_rate, 0) / Math.max(1, closed.length);

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Relatórios</h1>
          <p>Visão do dono. A recepção e os professores não veem esta página.</p>
        </div>
      </div>

      <section className="panel panel-pad stack">
        <div className="spread">
          <h3>Receita dos últimos 12 meses</h3>
          <div className="legend">
            <span>
              <i />
              recebido
            </span>
            <span>
              <i className="base" />
              previsto (vencimentos do mês)
            </span>
          </div>
        </div>
        <RevenueChart months={data.months} />
        <p className="small muted">Pagamentos atrasados ou fora do mês fazem o recebido passar do previsto em alguns meses.</p>
      </section>

      <div className="split">
        <section className="panel">
          <div className="panel-head">
            <h3>Como os alunos pagam (mês atual)</h3>
          </div>
          <ul className="list-plain">
            {data.methods.map((m) => (
              <li key={m.method}>
                <span>{PAY[m.method] || m.method}</span>
                <span className="tnum">
                  {money(m.v)} <span className="muted">({pct(m.v / totalMethods)})</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h3>Pagamento com atraso</h3>
            <span className="small muted">média {pct(avgLate)} das faturas</span>
          </div>
          <ul className="list-plain">
            {data.months.slice(-6).map((m) => (
              <li key={m.month}>
                <span>
                  {MONTHS[Number(m.month.slice(5)) - 1]}/{m.month.slice(2, 4)}
                </span>
                <span className="tnum" style={{ color: m.late_rate > 0.25 ? 'var(--red)' : undefined }}>
                  {pct(m.late_rate)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="split">
        <section className="panel">
          <div className="panel-head">
            <h3>Receita recorrente por plano</h3>
          </div>
          <ul className="list-plain">
            {data.plans.map((p) => (
              <li key={p.name}>
                <span>
                  {p.name} <span className="muted small">{p.n} contratos</span>
                </span>
                <b className="tnum">{moneyShort(p.mrr)}</b>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel panel-pad stack">
          <h3>Entradas por dia da semana (média de 4 semanas)</h3>
          {[1, 2, 3, 4, 5, 6, 0].map((d) => {
            const w = data.weekday.find((x) => x.wd === d);
            const v = w ? w.avg : 0;
            return (
              <div key={d} className="row">
                <span style={{ width: 36 }} className="small">
                  {WEEK[d]}
                </span>
                <div className="grow" style={{ background: 'var(--rule-soft)', height: 12, borderRadius: 2 }}>
                  <div style={{ width: `${(v / wdMax) * 100}%`, height: '100%', background: 'var(--ink)', borderRadius: 2 }} />
                </div>
                <span className="tnum small" style={{ width: 40, textAlign: 'right' }}>
                  {Math.round(v)}
                </span>
              </div>
            );
          })}
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h3>Motivos de cancelamento, últimos 6 meses</h3>
        </div>
        {data.churnReasons.length ? (
          <ul className="list-plain">
            {data.churnReasons.map((r) => (
              <li key={r.reason}>
                <span>{r.reason}</span>
                <b className="tnum">{r.n}</b>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty">Nenhum cancelamento no período.</div>
        )}
      </section>
    </div>
  );
}
