import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSession } from '../api.js';
import { useData, Loading, ErrorBox } from '../ui/kit.jsx';
import { money, moneyShort, time, METHOD, dateShort } from '../ui/format.js';
import { useLiveAccess } from './Layout.jsx';
import { Count } from '../site/motion.jsx';

export function Pass({ p, fresh }) {
  const cls = !p.granted ? 'deny' : p.direction === 'saida' ? 'out' : '';
  return (
    <div className={`pass ${cls} ${fresh ? 'fresh' : ''}`}>
      <span className="edge" />
      <time>{time(p.created_at)}</time>
      <div className="grow">
        <div className="who">
          {p.member_id ? <Link to={`/painel/alunos/${p.member_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{p.member_name}</Link> : 'Não identificado'}
        </div>
        <div className="why">
          {p.direction === 'saida' ? 'Saída' : p.granted ? p.message : p.label}
          {!p.granted && p.message && p.message !== p.label ? `. ${p.message}` : ''}
        </div>
        <div className="tiny faint">
          {METHOD[p.method] || p.method}, {p.device_name || 'recepção'}
        </div>
      </div>
    </div>
  );
}

function Gauge({ inside, max }) {
  const segs = 40;
  const on = Math.min(segs, Math.round((inside / Math.max(1, max)) * segs));
  return (
    <div className="gauge" role="img" aria-label={`${inside} de ${max} pessoas`}>
      {Array.from({ length: segs }, (_, i) => (
        <i key={i} className={i < on ? `on ${i >= segs * 0.9 ? 'hot' : i >= segs * 0.7 ? 'warm' : ''}` : ''} />
      ))}
    </div>
  );
}

function Hours({ hourly, baseline, open, close }) {
  const hrs = [];
  for (let h = open; h < close; h++) hrs.push(h);
  const max = Math.max(1, ...hrs.map((h) => Math.max(hourly[h], baseline[h])));
  const nowH = new Date().getHours();
  return (
    <div>
      <div className="hours" style={{ '--cols': hrs.length }}>
        {hrs.map((h) => (
          <div key={h} className={`h ${h === nowH ? 'now' : ''} ${h > nowH ? 'future' : ''}`} title={`${h}h: ${hourly[h]} entradas (média ${baseline[h]})`}>
            <div className="bar" style={{ height: `${(hourly[h] / max) * 100}%` }} />
            {baseline[h] > 0 && <span className="base" style={{ bottom: `${(baseline[h] / max) * 100}%` }} />}
          </div>
        ))}
      </div>
      <div className="hours-axis" style={{ '--cols': hrs.length }}>
        {hrs.map((h) => (
          <span key={h}>{h % 3 === 0 ? `${h}h` : ''}</span>
        ))}
      </div>
    </div>
  );
}

export default function Overview() {
  const { data, error, reload } = useData('/dashboard/overview');
  const [feed, setFeed] = useState([]);
  const [freshId, setFreshId] = useState(null);
  const [inside, setInside] = useState(null);
  const [counts, setCounts] = useState({ entries: 0, unique: 0 });
  const role = getSession().user.role;

  useEffect(() => {
    if (data) {
      setFeed(data.recent);
      setInside(data.today.inside);
      setCounts({ entries: data.today.entries });
    }
  }, [data]);

  const online = useLiveAccess((ev) => {
    setFeed((f) => [ev, ...f].slice(0, 60));
    setFreshId(ev.id);
    setInside(ev.inside);
    if (ev.granted && ev.direction === 'entrada') setCounts((c) => ({ entries: c.entries + 1 }));
  });

  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Loading />;
  const { today: t, members: m, finance: f, gym, leads } = data;
  const denied = t.denials.reduce((s, d) => s + d.n, 0);
  const peakH = t.baseline.indexOf(Math.max(...t.baseline));
  const dayName = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const maxDaily = Math.max(1, ...data.daily.map((d) => d.n));

  return (
    <div className="today">
      <div className="stack-lg">
        <div className="page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1>Hoje</h1>
            <p style={{ textTransform: 'none' }}>{dayName.charAt(0).toUpperCase() + dayName.slice(1)}</p>
          </div>
          <Link to="/painel/catraca" className="btn">
            Abrir catraca e simulador
          </Link>
        </div>

        <section className="panel occupancy">
          <div className="occ-top">
            <div className="occ-now">
              <span className="num">
                <Count to={inside} duration={900} />
                <span className="of">/{gym.max_capacity}</span>
              </span>
              <div className="occ-label">pessoas treinando agora</div>
            </div>
            <div className="occ-stats">
              <div>
                <span className="num">
                  <Count to={counts.entries} duration={1200} />
                </span>
                <span>entradas hoje</span>
              </div>
              <div>
                <span className="num" style={{ color: denied ? 'var(--red)' : undefined }}>{denied}</span>
                <span>bloqueios</span>
              </div>
              <div>
                <span className="num">{peakH}h</span>
                <span>pico neste dia da semana</span>
              </div>
            </div>
          </div>
          <Gauge inside={inside} max={gym.max_capacity} />
          <div className="stack" style={{ gap: 8 }}>
            <div className="spread">
              <h3>Entradas por hora</h3>
              <div className="legend">
                <span>
                  <i />
                  hoje
                </span>
                <span>
                  <i className="base" />
                  média das últimas 4 semanas
                </span>
              </div>
            </div>
            <Hours hourly={t.hourly} baseline={t.baseline} open={gym.open_hour} close={gym.close_hour} />
          </div>
        </section>

        {f && (
          <section className="panel kpis">
            <div>
              <span>Recebido no mês</span>
              <b className="num">
                <Count to={f.received_cents / 100} prefix="R$ " decimals={2} />
              </b>
              <div className="note muted">de {moneyShort(f.expected_cents)} previstos</div>
            </div>
            <div>
              <span>Receita recorrente</span>
              <b className="num">{moneyShort(f.mrr_cents)}</b>
              <div className="note muted">{m.active} contratos ativos</div>
            </div>
            <div>
              <span>Em atraso</span>
              <b className="num" style={{ color: f.overdue_cents ? 'var(--red)' : undefined }}>{moneyShort(f.overdue_cents)}</b>
              <div className="note">
                <Link to="/painel/financeiro?state=vencido">{f.overdue_members} alunos para cobrar</Link>
              </div>
            </div>
            <div>
              <span>Matrículas no mês</span>
              <b className="num">
                <Count to={m.new_month} duration={1000} />
              </b>
              <div className="note muted">{m.cancels_month} cancelamento(s)</div>
            </div>
          </section>
        )}

        <div className="split">
          <section className="panel">
            <div className="panel-head">
              <h3>Por que a catraca segurou hoje</h3>
            </div>
            {t.denials.length ? (
              <ul className="list-plain">
                {t.denials.map((d) => (
                  <li key={d.code}>
                    <span>{d.label}</span>
                    <b className="tnum">{d.n}</b>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty">Nenhum bloqueio hoje.</div>
            )}
          </section>
          <section className="panel">
            <div className="panel-head">
              <h3>Precisa de atenção</h3>
            </div>
            <ul className="list-plain">
              <li>
                <Link to="/painel/alunos?situation=bloqueado">Bloqueados por atraso</Link>
                <b className="tnum">{m.situation.bloqueado || 0}</b>
              </li>
              <li>
                <Link to="/painel/alunos?situation=vencido">Atrasados, ainda dentro da tolerância</Link>
                <b className="tnum">{m.situation.vencido || 0}</b>
              </li>
              <li>
                <Link to="/painel/alunos?situation=vence_logo">Plano termina nos próximos 7 dias</Link>
                <b className="tnum">{m.situation.vence_logo || 0}</b>
              </li>
              {role !== 'professor' && (
                <li>
                  <Link to="/painel/crm">Leads com retorno atrasado</Link>
                  <b className="tnum" style={{ color: leads.late ? 'var(--red)' : undefined }}>
                    {leads.late}
                  </b>
                </li>
              )}
            </ul>
          </section>
        </div>

        <section className="panel panel-pad stack">
          <div className="spread">
            <h3>Alunos diferentes por dia, últimos 30 dias</h3>
            <span className="small muted">média {Math.round(data.daily.reduce((s, d) => s + d.n, 0) / data.daily.length)}/dia</span>
          </div>
          <div className="sparkdays">
            {data.daily.map((d, i) => {
              const wd = new Date(`${d.date}T12:00:00`).getDay();
              return <i key={d.date} title={`${dateShort(d.date)}: ${d.n}`} className={i === data.daily.length - 1 ? 'today' : wd === 0 || wd === 6 ? 'we' : ''} style={{ height: `${Math.max(3, (d.n / maxDaily) * 100)}%` }} />;
            })}
          </div>
          <div className="spread tiny faint">
            <span>{dateShort(data.daily[0].date)}</span>
            <span>hoje</span>
          </div>
        </section>
      </div>

      <aside className="panel feed" aria-live="polite">
        <div className="feed-head">
          <h3>
            <span className={`live-dot ${online ? '' : 'off'}`} />
            Catraca ao vivo
          </h3>
          <span className="tiny faint">{online ? 'conectado' : 'reconectando…'}</span>
        </div>
        <div className="feed-list">
          {feed.length ? feed.map((p) => <Pass key={p.id} p={p} fresh={p.id === freshId} />) : <div className="empty">Nenhuma passagem ainda hoje.</div>}
        </div>
      </aside>
    </div>
  );
}

export { money };
