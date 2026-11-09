import { useEffect, useState } from 'react';
import { BrandMark, Loading } from '../ui/kit.jsx';
import { money, moneyShort, pct, date, relDays } from '../ui/format.js';

const KEY = 'fm.platform';
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const PROVIDER = { manual: 'Manual', simulado: 'Testes', asaas: 'Asaas' };

/** Painel do dono do FitManager: quanto a plataforma fatura e onde está o dinheiro deixado na mesa. */
export default function Platform() {
  const [key, setKey] = useState(() => {
    try {
      return sessionStorage.getItem(KEY) || '';
    } catch {
      return '';
    }
  });
  const [input, setInput] = useState('');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!key) return;
    fetch('/api/platform/overview', { headers: { 'x-platform-key': key } })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        setData(j);
        try {
          sessionStorage.setItem(KEY, key);
        } catch {
          /* sem storage */
        }
      })
      .catch((e) => {
        setErr(e.message);
        setKey('');
      });
  }, [key]);

  if (!key)
    return (
      <div className="auth-page">
        <form className="panel auth-card stack" onSubmit={(e) => (e.preventDefault(), setErr(''), setKey(input.trim()))}>
          <div className="row">
            <BrandMark />
            <b style={{ fontVariationSettings: "'wdth' 118", fontWeight: 800 }}>FitManager, plataforma</b>
          </div>
          <label className="field">
            <span>Chave da plataforma</span>
            <input className="input" type="password" value={input} onChange={(e) => setInput(e.target.value)} autoFocus />
            <small>Fica em api/.platform-key ou na variável FM_PLATFORM_KEY.</small>
          </label>
          {err && <div className="alert red">{err}</div>}
          <button className="btn primary">Entrar</button>
        </form>
      </div>
    );
  if (!data) return <Loading />;
  const t = data.totals;
  const maxFee = Math.max(1, ...data.months.map((m) => m.fees_cents));
  const lost = Math.max(0, t.fee_potential_cents - t.fees_month_cents);

  return (
    <div className="main" style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div className="stack-lg">
        <div className="page-head">
          <div className="row">
            <BrandMark />
            <div>
              <h1>Plataforma</h1>
              <p>
                Taxa de {String(data.fee.pct).replace('.', ',')}% por pagamento, mínimo {money(data.fee.min_cents)}.
                {data.fee.wallet_configured ? ' Split ativo para a carteira do FitManager.' : ' Defina FM_PLATFORM_WALLET_ID para o split cair na sua carteira Asaas.'}
              </p>
            </div>
          </div>
          <button
            className="btn"
            onClick={() => {
              try {
                sessionStorage.removeItem(KEY);
              } catch {
                /* sem storage */
              }
              setKey('');
              setData(null);
            }}
          >
            Sair
          </button>
        </div>

        <section className="panel kpis">
          <div>
            <span>Receita do mês</span>
            <b className="num">{moneyShort(t.revenue_month_cents)}</b>
            <div className="note muted">
              {moneyShort(t.subscriptions_cents)} de assinaturas + {moneyShort(t.fees_month_cents)} de taxas
            </div>
          </div>
          <div>
            <span>Volume pago online</span>
            <b className="num">{moneyShort(t.gmv_month_cents)}</b>
            <div className="note muted">nas {t.gyms} academias</div>
          </div>
          <div>
            <span>Taxa que ficou na mesa</span>
            <b className="num" style={{ color: lost ? 'var(--yellow-ink)' : undefined }}>
              {moneyShort(lost)}
            </b>
            <div className="note muted">mensalidades pagas fora do app</div>
          </div>
          <div>
            <span>Academias paradas</span>
            <b className="num" style={{ color: t.stale_gyms ? 'var(--red)' : undefined }}>
              {t.stale_gyms}
            </b>
            <div className="note muted">sem catraca há 7 dias, risco de cancelar</div>
          </div>
        </section>

        <section className="panel panel-pad stack">
          <h3>Taxas recebidas por mês</h3>
          <div className="hours" style={{ '--cols': data.months.length, height: 140 }}>
            {data.months.map((m) => (
              <div key={m.month} className="h" title={`${m.month}: ${money(m.fees_cents)} de ${money(m.gmv_cents)} transacionados`}>
                <div className="bar" style={{ height: `${(m.fees_cents / maxFee) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="hours-axis" style={{ '--cols': data.months.length }}>
            {data.months.map((m) => (
              <span key={m.month}>{MONTHS[Number(m.month.slice(5)) - 1]}</span>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h3>Academias</h3>
            <span className="small muted">ordene a carteira pelo que falta: academia com pouco pagamento online é receita para buscar</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Academia</th>
                  <th>Plano</th>
                  <th>Recebimento</th>
                  <th className="right">Alunos</th>
                  <th className="right">Pago online</th>
                  <th className="right">Taxas no mês</th>
                  <th className="hide-sm">Última catraca</th>
                </tr>
              </thead>
              <tbody>
                {data.gyms.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <b>{g.name}</b>
                      <div className="tiny faint">desde {date(g.created_at)}</div>
                    </td>
                    <td>{g.saas_plan}</td>
                    <td>
                      <span className={`tag ${g.pay_provider === 'manual' ? 'yellow' : 'green'}`}>{PROVIDER[g.pay_provider]}</span>
                    </td>
                    <td className="right tnum">{g.active_members}</td>
                    <td className="right tnum">
                      {money(g.gmv_cents)} <span className="muted small">({pct(g.online_share)})</span>
                    </td>
                    <td className="right tnum">{money(g.fees_cents)}</td>
                    <td className="hide-sm" style={{ color: !g.last_activity ? 'var(--red)' : undefined }}>
                      {g.last_activity ? relDays(g.last_activity) : 'nunca'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
