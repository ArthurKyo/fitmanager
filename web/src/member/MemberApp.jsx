import { useEffect, useRef, useState } from 'react';
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { api, get, post, put, setSession } from '../api.js';
import { useData, Loading, ErrorBox, QR, Icon, useToast } from '../ui/kit.jsx';
import { money, date, dateShort, firstName, todayStr } from '../ui/format.js';
import ExerciseSheet from './ExerciseSheet.jsx';
import Cardio from './Cardio.jsx';
import ShareCard from './Share.jsx';

const MUSCLE_TITLE = (items) => [...new Set(items.map((i) => i.muscle))].slice(0, 3).join(', ');

function StatusLine({ me }) {
  const tone = { em_dia: 'green', vence_logo: 'blue', vencido: 'yellow', bloqueado: 'red' }[me.situation.key] || '';
  return <span className={`tag ${tone}`}>{me.situation.label}</span>;
}

function Weeks({ days }) {
  // 5 semanas, segunda a domingo, terminando nesta semana
  const today = new Date(`${todayStr()}T12:00:00`);
  const dow = (today.getDay() + 6) % 7;
  const start = new Date(today);
  start.setDate(today.getDate() - dow - 28);
  const set = new Set(days);
  const cells = [];
  for (let i = 0; i < 35; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    cells.push(<i key={s} title={dateShort(s)} className={`${set.has(s) ? 'on' : ''} ${s === todayStr() ? 'today' : ''} ${d > today ? 'future' : ''}`} />);
  }
  return (
    <div>
      <div className="weeks" style={{ marginBottom: 4 }}>
        {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((d, i) => (
          <span key={i} className="tiny faint" style={{ textAlign: 'center' }}>
            {d}
          </span>
        ))}
      </div>
      <div className="weeks">{cells}</div>
    </div>
  );
}

function RestTimer({ seconds, onDone }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    setLeft(seconds);
    const t = setInterval(() => setLeft((x) => x - 1), 1000);
    return () => clearInterval(t);
  }, [seconds]);
  useEffect(() => {
    if (left <= 0) {
      navigator.vibrate?.([200, 100, 200]);
      onDone();
    }
  }, [left, onDone]);
  return (
    <div className="rest" role="timer" aria-live="off">
      <div>
        <div className="small" style={{ opacity: 0.75 }}>
          Descanso
        </div>
        <span className="num">
          {Math.floor(Math.max(0, left) / 60)}:{String(Math.max(0, left) % 60).padStart(2, '0')}
        </span>
      </div>
      <button className="btn sm" onClick={onDone}>
        Pular
      </button>
    </div>
  );
}

function Workout({ me }) {
  const toast = useToast();
  const { data, error, reload } = useData('/me/workout');
  const [div, setDiv] = useState(null);
  const [done, setDone] = useState({});
  const [rest, setRest] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [share, setShare] = useState(null);
  const startedAt = useRef(Date.now());
  useEffect(() => {
    if (data?.workout && !div) setDiv(data.suggested);
  }, [data, div]);
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(`fm.sets.${todayStr()}`) || '{}');
      setDone(saved);
    } catch {
      /* sem storage */
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(`fm.sets.${todayStr()}`, JSON.stringify(done));
    } catch {
      /* sem storage */
    }
  }, [done]);

  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Loading />;
  if (!data.workout)
    return (
      <div className="app-section">
        <div className="panel empty">
          <strong>Você ainda não tem ficha.</strong>
          Peça para um professor montar seu treino. Ele aparece aqui assim que for salvo.
        </div>
      </div>
    );

  const w = data.workout;
  const items = w.items.filter((i) => i.division === div);
  const key = (i, s) => `${div}:${i.id}:${s}`;
  const total = items.reduce((s, i) => s + i.sets, 0);
  const checked = items.reduce((s, i) => s + Array.from({ length: i.sets }).filter((_, k) => done[key(i, k)]).length, 0);
  const already = data.done_today.includes(div);

  async function finish() {
    const minutes = Math.round((Date.now() - startedAt.current) / 60000) || 1;
    try {
      await post('/me/sessions', { division: div, duration_min: minutes });
      reload();
      setShare({
        kind: 'treino',
        title: `Treino ${div} feito`,
        stats: [
          [String(checked), 'séries'],
          [String(items.length), 'exercícios'],
          [`${minutes}'`, 'minutos'],
          [String(me.month_visits + 1), 'treinos no mês'],
        ],
      });
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  return (
    <>
      <div className="app-section">
        <div className="panel today-card">
          <span className="big-letter" aria-hidden="true">
            {div}
          </span>
          <div className="stack" style={{ gap: 6 }}>
            <div>
              <div className="small muted">{div === data.suggested ? 'Treino de hoje' : 'Treino escolhido'}</div>
              <b style={{ fontSize: 17, lineHeight: 1.25, display: 'block' }}>{MUSCLE_TITLE(items)}</b>
              <div className="small muted">
                {items.length} exercícios, {checked}/{total} séries
              </div>
            </div>
            <div className="div-pick" role="group" aria-label="Escolher divisão">
              {w.divisions.map((d) => (
                <button key={d} aria-pressed={d === div} className={data.done_today.includes(d) ? 'done' : ''} onClick={() => setDiv(d)}>
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>
        {data.expired && <div className="alert yellow" style={{ marginTop: 10 }}>Sua ficha passou da data de troca ({date(w.valid_until)}). Peça uma nova ao professor.</div>}
      </div>

      <div className="app-section">
        <div className="panel">
          {items.map((i) => (
            <div className="ex" key={i.id}>
              <div>
                <button className="ex-name ex-open" onClick={() => setSheet(i.exercise_id)} aria-label={`Como fazer ${i.exercise_name}`}>
                  {i.exercise_name}
                  <Icon name="help" size={16} />
                </button>
                <div className="ex-meta">
                  {i.sets} x {i.reps}
                  {i.load_kg ? `, ${String(i.load_kg).replace('.', ',')} kg` : ''}
                  {i.rest_sec ? `, descanso ${i.rest_sec}s` : ''}
                </div>
              </div>
              <div className="sets">
                {Array.from({ length: i.sets }, (_, s) => (
                  <button
                    key={s}
                    className={`set ${done[key(i, s)] ? 'done' : ''}`}
                    aria-pressed={!!done[key(i, s)]}
                    aria-label={`Série ${s + 1} de ${i.exercise_name}`}
                    onClick={() => {
                      const on = !done[key(i, s)];
                      setDone((d) => ({ ...d, [key(i, s)]: on }));
                      if (on && i.rest_sec) setRest({ sec: i.rest_sec, n: Date.now() });
                    }}
                  >
                    {done[key(i, s)] ? <Icon name="check" size={18} /> : s + 1}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      {rest && <RestTimer key={rest.n} seconds={rest.sec} onDone={() => setRest(null)} />}
      {sheet && <ExerciseSheet exerciseId={sheet} onClose={() => setSheet(null)} />}
      {share && <ShareCard {...share} onClose={() => setShare(null)} />}
      <div className="app-section" style={{ paddingTop: 12 }}>
        <button className="btn go lg" style={{ width: '100%' }} onClick={finish} disabled={already}>
          {already ? `Treino ${div} já registrado hoje` : `Concluir treino ${div}`}
        </button>
      </div>
    </>
  );
}

function Home() {
  const { data: me, error, reload } = useData('/me');
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!me) return <Loading />;
  const inv = me.next_invoice;
  return (
    <>
      <div className="app-section">
        <div className="row wrap">
          <StatusLine me={me} />
          {me.contract && <span className="small muted">{me.contract.plan_name}, até {date(me.contract.end_date)}</span>}
        </div>
        {inv && (inv.state === 'vencido' || inv.due_date <= new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10)) && (
          <NavLink to="/app/pagamentos" className={`alert ${inv.state === 'vencido' ? 'red' : 'blue'}`} style={{ display: 'block', marginTop: 10, textDecoration: 'none' }}>
            {inv.state === 'vencido' ? `Mensalidade vencida em ${date(inv.due_date)}: ${money(inv.due_cents)}. Pague pelo Pix para liberar a catraca.` : `Mensalidade de ${money(inv.due_cents)} vence ${inv.due_date === todayStr() ? 'hoje' : `em ${dateShort(inv.due_date)}`}. Pagar pelo Pix.`}
          </NavLink>
        )}
      </div>
      <Workout me={me} />
      <div className="app-section">
        <div className="panel panel-pad stack">
          <div className="spread">
            <h3>Frequência</h3>
            <span className="small muted">
              {me.month_visits} treinos no mês
              {me.steady_weeks > 1 ? `, ${me.steady_weeks} semanas seguidas com 3+` : ''}
            </span>
          </div>
          <Weeks days={me.visit_days} />
        </div>
      </div>
    </>
  );
}

function Diet() {
  const { data, error, reload } = useData('/me/diet');
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Loading />;
  const d = data.diet;
  if (!d)
    return (
      <div className="app-section">
        <div className="panel empty">
          <strong>Sem plano alimentar.</strong>
          Quando o nutricionista ou professor liberar, ele aparece aqui.
        </div>
      </div>
    );
  const t = d.totals;
  const kc = { p: t.protein_g * 4, c: t.carbs_g * 4, g: t.fat_g * 9 };
  const sum = kc.p + kc.c + kc.g || 1;
  const nowHM = new Date().toTimeString().slice(0, 5);
  const nextMeal = d.meals.find((m) => m.time && m.time >= nowHM);
  return (
    <>
      <div className="app-section">
        <div className="panel panel-pad stack">
          <div className="spread">
            <div>
              <span className="num" style={{ fontSize: 34 }}>
                {t.kcal}
              </span>{' '}
              <span className="muted">kcal por dia</span>
            </div>
            <span className="small muted">meta {d.kcal_target}</span>
          </div>
          <div className="macro-bar" aria-hidden="true">
            <span style={{ width: `${(kc.p / sum) * 100}%`, background: 'var(--blue)' }} />
            <span style={{ width: `${(kc.c / sum) * 100}%`, background: 'var(--yellow)' }} />
            <span style={{ width: `${(kc.g / sum) * 100}%`, background: 'var(--red)' }} />
          </div>
          <div className="spread small">
            <span>
              <b style={{ color: 'var(--blue)' }}>{t.protein_g} g</b> proteína
            </span>
            <span>
              <b style={{ color: 'var(--yellow-ink)' }}>{t.carbs_g} g</b> carboidrato
            </span>
            <span>
              <b style={{ color: 'var(--red)' }}>{t.fat_g} g</b> gordura
            </span>
          </div>
        </div>
      </div>
      <div className="app-section">
        <div className="panel">
          {d.meals.map((m) => (
            <div className="meal" key={m.id} style={nextMeal?.id === m.id ? { boxShadow: 'inset 3px 0 0 var(--blue)' } : undefined}>
              <div className="meal-head">
                <time>{m.time}</time>
                <b>{m.name}</b>
                {nextMeal?.id === m.id && <span className="tag blue">próxima</span>}
                <span className="small muted" style={{ marginLeft: 'auto' }}>
                  {m.items.reduce((s, i) => s + i.kcal, 0)} kcal
                </span>
              </div>
              {m.items.map((i) => (
                <div className="food" key={i.id}>
                  <span>{i.food}</span>
                  <span className="muted">{i.qty}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        {d.notes && <p className="small muted" style={{ padding: '12px 4px' }}>{d.notes}</p>}
      </div>
    </>
  );
}

function Pass() {
  const [qr, setQr] = useState(null);
  const [err, setErr] = useState('');
  const [left, setLeft] = useState(30);
  useEffect(() => {
    let alive = true;
    let timer;
    const load = () =>
      get('/me/access-qr')
        .then((r) => {
          if (!alive) return;
          setQr(r);
          setLeft(Math.ceil(r.expiresInMs / 1000));
          timer = setTimeout(load, r.expiresInMs + 200);
        })
        .catch((e) => setErr(e.message));
    load();
    const tick = setInterval(() => setLeft((x) => Math.max(0, x - 1)), 1000);
    return () => {
      alive = false;
      clearTimeout(timer);
      clearInterval(tick);
    };
  }, []);
  return (
    <div className="app-section">
      <div className="panel pass-card">
        <h2>Entrada pelo QR</h2>
        <p className="small muted">Aproxime da leitora da catraca. O código muda a cada 30 segundos, então print não funciona.</p>
        {err && <div className="alert red">{err}</div>}
        {qr && (
          <>
            <div className="qr-box">
              <QR value={qr.code} />
            </div>
            <div className="countdown" aria-hidden="true">
              <i style={{ width: `${(left / 30) * 100}%` }} />
            </div>
            <span className="small muted tnum">novo código em {left}s</span>
          </>
        )}
      </div>
    </div>
  );
}

function usePoll(fn, ms, active) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => ref.current(), ms);
    return () => clearInterval(t);
  }, [ms, active]);
}

/** Pix com baixa automática: o app fica olhando a fatura até o gateway confirmar. */
function OnlinePix({ invoice, testMode, onPaid }) {
  const toast = useToast();
  const [charge, setCharge] = useState(null);
  const [err, setErr] = useState('');
  const [paid, setPaid] = useState(false);
  useEffect(() => {
    post(`/me/invoices/${invoice.id}/checkout`, { method: 'pix' }).then(setCharge, (e) => setErr(e.message));
  }, [invoice.id]);
  usePoll(
    async () => {
      const s = await get(`/me/invoices/${invoice.id}/status`);
      if (s.status === 'pago') {
        setPaid(true);
        onPaid();
      }
    },
    4000,
    !!charge && !paid
  );
  if (err) return <div className="alert red">{err}</div>;
  if (paid)
    return (
      <div className="alert green" role="status">
        <b>Pagamento confirmado.</b> A catraca já libera sua entrada.
      </div>
    );
  if (!charge) return <Loading />;
  return (
    <div className="stack" style={{ justifyItems: 'center' }}>
      <span className="num" style={{ fontSize: 34 }}>{money(charge.amount_cents)}</span>
      {invoice.days_late > 0 && <span className="small muted">inclui multa de {money(invoice.fine_cents)} e juros de {money(invoice.interest_cents)}</span>}
      <div className="qr-box">
        <QR value={charge.pix_payload} size={210} />
      </div>
      <button
        className="btn primary lg"
        style={{ width: '100%' }}
        onClick={() =>
          navigator.clipboard?.writeText(charge.pix_payload).then(
            () => toast('Código Pix copiado. Cole no app do seu banco.'),
            () => toast('Não deu para copiar. Selecione o código abaixo.', 'err')
          )
        }
      >
        <Icon name="copy" /> Copiar Pix copia e cola
      </button>
      <div className="pix-code" style={{ width: '100%', textAlign: 'left' }}>{charge.pix_payload}</div>
      <p className="small muted row" style={{ justifyContent: 'center' }}>
        <span className="live-dot" /> Aguardando o banco. A confirmação chega sozinha, pode deixar esta tela aberta.
      </p>
      {testMode && (
        <button className="btn sm" onClick={() => post(`/me/charges/${charge.id}/simulate-paid`).catch((e) => setErr(e.message))}>
          Simular pagamento do banco (modo de testes)
        </button>
      )}
    </div>
  );
}

function CardForm({ onSaved, testMode }) {
  const [v, setV] = useState({ holderName: '', number: '', expiry: '', ccv: '', postalCode: '', addressNumber: '', autopay: true });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const b = (k) => ({ value: v[k], onChange: (e) => setV({ ...v, [k]: e.target.value }) });
  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    const [mm, yy] = v.expiry.split('/').map((x) => x.trim());
    try {
      const r = await post('/me/card', { ...v, number: v.number.replace(/\s/g, ''), expiryMonth: mm, expiryYear: yy });
      onSaved(r);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="stack" onSubmit={submit}>
      <label className="field">
        <span>Número do cartão</span>
        <input className="input" inputMode="numeric" autoComplete="cc-number" required {...b('number')} />
      </label>
      <label className="field">
        <span>Nome impresso</span>
        <input className="input" autoComplete="cc-name" required {...b('holderName')} />
      </label>
      <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <label className="field">
          <span>Validade</span>
          <input className="input" placeholder="MM/AA" autoComplete="cc-exp" required {...b('expiry')} />
        </label>
        <label className="field">
          <span>CVV</span>
          <input className="input" inputMode="numeric" autoComplete="cc-csc" required {...b('ccv')} />
        </label>
      </div>
      <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <label className="field">
          <span>CEP</span>
          <input className="input" inputMode="numeric" autoComplete="postal-code" {...b('postalCode')} />
        </label>
        <label className="field">
          <span>Número</span>
          <input className="input" {...b('addressNumber')} />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={v.autopay} onChange={(e) => setV({ ...v, autopay: e.target.checked })} />
        <span>
          Débito automático: cobrar as próximas mensalidades neste cartão no dia do vencimento. Cobra mês a mês e não ocupa o limite do plano inteiro.
        </span>
      </label>
      {testMode && <p className="tiny faint">Modo de testes: 4111 1111 1111 1111 aprova, 4000 0000 0000 0002 recusa.</p>}
      {err && <div className="alert red">{err}</div>}
      <button className="btn primary lg" disabled={busy}>
        {busy ? 'Validando…' : 'Salvar cartão'}
      </button>
      <p className="tiny faint">Os dados vão direto para o processador de pagamentos. A academia não vê nem guarda o número do cartão.</p>
    </form>
  );
}

function PayPanel({ invoice, options, onClose, onChanged }) {
  const toast = useToast();
  const [method, setMethod] = useState(options.methods.includes('pix') ? 'pix' : options.methods[0]);
  const [card, setCard] = useState(options.card);
  const [adding, setAdding] = useState(!options.card);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [boleto, setBoleto] = useState(null);

  async function payCard() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await post(`/me/invoices/${invoice.id}/pay-card`);
      if (r.approved) {
        toast('Pagamento aprovado. Catraca liberada.');
        onChanged();
        onClose();
      } else setMsg(r.reason || 'Pagamento não aprovado');
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel panel-pad stack">
      <div className="spread">
        <div>
          <b>{invoice.description}</b>
          <div className="small muted">vencimento {date(invoice.due_date)}</div>
        </div>
        <button className="btn ghost sm" onClick={onClose} aria-label="Fechar">
          <Icon name="x" />
        </button>
      </div>
      <div className="div-pick" role="group" aria-label="Forma de pagamento" style={{ gap: 6 }}>
        {[
          ['pix', 'Pix'],
          ['cartao', 'Cartão'],
          ['boleto', 'Boleto'],
        ]
          .filter(([k]) => options.methods.includes(k))
          .map(([k, l]) => (
            <button key={k} aria-pressed={method === k} onClick={() => setMethod(k)} style={{ width: 'auto', padding: '0 14px' }}>
              {l}
            </button>
          ))}
      </div>

      {method === 'pix' && <OnlinePix invoice={invoice} testMode={options.test_mode} onPaid={onChanged} />}

      {method === 'cartao' &&
        (adding ? (
          <CardForm
            testMode={options.test_mode}
            onSaved={(c) => {
              setCard(c);
              setAdding(false);
              onChanged();
            }}
          />
        ) : (
          <div className="stack">
            <div className="spread">
              <span>
                {card.brand} final <b className="tnum">{card.last4}</b>
              </span>
              <button className="btn ghost sm" onClick={() => setAdding(true)}>
                Trocar cartão
              </button>
            </div>
            {msg && <div className="alert red">{msg}. Tente outro cartão ou pague por Pix.</div>}
            <button className="btn primary lg" onClick={payCard} disabled={busy}>
              {busy ? 'Processando…' : `Pagar ${money(invoice.due_cents)} no cartão`}
            </button>
          </div>
        ))}

      {method === 'boleto' &&
        (boleto ? (
          <div className="stack">
            <a className="btn primary lg" href={boleto.boleto_url || boleto.invoice_url} target="_blank" rel="noreferrer">
              Abrir boleto
            </a>
            <p className="small muted">Boleto compensa em até 3 dias úteis. Para liberar a catraca na hora, use Pix.</p>
            {options.test_mode && (
              <button className="btn sm" onClick={() => post(`/me/charges/${boleto.id}/simulate-paid`).then(() => (toast('Boleto compensado'), onChanged(), onClose()))}>
                Simular compensação (modo de testes)
              </button>
            )}
          </div>
        ) : (
          <button
            className="btn lg"
            onClick={() =>
              post(`/me/invoices/${invoice.id}/checkout`, { method: 'boleto' }).then(setBoleto, (e) => setMsg(e.message))
            }
          >
            Gerar boleto de {money(invoice.due_cents)}
          </button>
        ))}
    </div>
  );
}

/** Academia sem gateway: Pix estático, a recepção confirma. */
function ManualPix({ invoice, onClose }) {
  const toast = useToast();
  const { data, error } = useData(`/me/invoices/${invoice.id}/pix`);
  return (
    <div className="panel panel-pad stack" style={{ justifyItems: 'center', textAlign: 'center' }}>
      {error && <div className="alert red">{error.message}</div>}
      {data && (
        <>
          <span className="num" style={{ fontSize: 34 }}>{money(data.amount_cents)}</span>
          <div className="qr-box">
            <QR value={data.payload} size={210} />
          </div>
          <button className="btn primary lg" style={{ width: '100%' }} onClick={() => navigator.clipboard?.writeText(data.payload).then(() => toast('Código Pix copiado'))}>
            <Icon name="copy" /> Copiar Pix copia e cola
          </button>
          <p className="small muted">A academia confirma o pagamento manualmente. Se continuar bloqueado, mostre o comprovante na recepção.</p>
        </>
      )}
      <button className="btn ghost" onClick={onClose}>
        Fechar
      </button>
    </div>
  );
}

function SavedCard({ options, onChanged }) {
  const toast = useToast();
  const c = options.card;
  if (!options.online || !c) return null;
  return (
    <div className="app-section">
      <div className="panel panel-pad stack">
        <div className="spread">
          <span>
            Cartão {c.brand} final <b className="tnum">{c.last4}</b>
          </span>
          <button
            className="btn ghost sm"
            onClick={() => api('/me/card', { method: 'DELETE' }).then(() => (toast('Cartão removido'), onChanged()))}
          >
            Remover
          </button>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={c.autopay}
            onChange={(e) => put('/me/card/autopay', { enabled: e.target.checked }).then(() => (toast(e.target.checked ? 'Débito automático ligado' : 'Débito automático desligado'), onChanged()))}
          />
          <span>Débito automático no vencimento</span>
        </label>
      </div>
    </div>
  );
}

function Payments() {
  const { data, error, reload } = useData('/me/invoices');
  const opts = useData('/me/payment-options');
  const [open, setOpen] = useState(null);
  if (error || opts.error) return <ErrorBox error={error || opts.error} retry={reload} />;
  if (!data || !opts.data) return <Loading />;
  const options = opts.data;
  const pending = data.filter((i) => i.status === 'pendente').sort((a, b) => a.due_date.localeCompare(b.due_date));
  const paid = data.filter((i) => i.status === 'pago');
  const refresh = () => {
    reload();
    opts.reload();
  };
  return (
    <>
      {open && (
        <div className="app-section">
          {options.online ? (
            <PayPanel invoice={open} options={options} onClose={() => setOpen(null)} onChanged={refresh} />
          ) : (
            <ManualPix invoice={open} onClose={() => setOpen(null)} />
          )}
        </div>
      )}
      <div className="app-section">
        <h3 style={{ margin: '4px 4px 8px' }}>Em aberto</h3>
        <div className="panel">
          {pending.length ? (
            <ul className="list-plain">
              {pending.slice(0, 6).map((i) => (
                <li key={i.id} style={{ alignItems: 'center' }}>
                  <span>
                    <b className="tnum">{date(i.due_date)}</b>
                    <div className="tiny muted">{i.description}</div>
                  </span>
                  <span className="row">
                    <span className="tnum" style={{ color: i.state === 'vencido' ? 'var(--red)' : undefined, fontWeight: 650 }}>
                      {money(i.due_cents)}
                    </span>
                    {(options.online || options.methods.length > 0) && (
                      <button className="btn sm primary" onClick={() => (setOpen(i), window.scrollTo({ top: 0, behavior: 'smooth' }))}>
                        Pagar
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">Tudo pago. Nenhuma fatura em aberto.</div>
          )}
        </div>
        {options.card?.autopay && pending.length > 0 && (
          <p className="small muted" style={{ padding: '8px 4px' }}>
            Débito automático ligado: cobramos no cartão final {options.card.last4} no dia do vencimento.
          </p>
        )}
      </div>
      <SavedCard options={options} onChanged={refresh} />
      <div className="app-section">
        <h3 style={{ margin: '12px 4px 8px' }}>Pagas</h3>
        <div className="panel">
          <ul className="list-plain">
            {paid.slice(0, 12).map((i) => (
              <li key={i.id}>
                <span>
                  {date(i.due_date)} <span className="tiny muted">{i.description}</span>
                </span>
                <span className="tnum muted">{money(i.paid_cents)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}

const TABS = [
  ['/app', 'Treino', 'dumbbell', true],
  ['/app/cardio', 'Cardio', 'run'],
  ['/app/passe', 'Entrar', 'qr'],
  ['/app/dieta', 'Dieta', 'food'],
  ['/app/pagamentos', 'Mensalidade', 'card'],
];

export default function MemberApp() {
  const nav = useNavigate();
  const { data: me } = useData('/me');
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  return (
    <div className="app">
      <header className="app-top">
        <div>
          <div className="small muted">{me?.gym.name}</div>
          <h1>
            {hello}, {me ? firstName(me.member.name) : ''}
          </h1>
        </div>
        <button
          className="btn ghost sm"
          aria-label="Sair"
          onClick={() => {
            setSession(null);
            nav('/entrar?app=1');
          }}
        >
          <Icon name="logout" /> Sair
        </button>
      </header>
      <Routes>
        <Route index element={<Home />} />
        <Route path="dieta" element={<Diet />} />
        <Route path="cardio" element={<Cardio />} />
        <Route path="passe" element={<Pass />} />
        <Route path="pagamentos" element={<Payments />} />
      </Routes>
      <nav className="tabbar">
        {TABS.map(([to, label, icon, end]) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon name={icon} size={22} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
