import { useCallback, useEffect, useRef, useState } from 'react';
import { get, post, put } from '../api.js';
import { useData, Loading, ErrorBox, Icon, useToast } from '../ui/kit.jsx';
import { date, dateShort, time } from '../ui/format.js';
import ShareCard from './Share.jsx';

export const KINDS = {
  corrida: { label: 'Corrida', gps: true, met: 9.8 },
  caminhada: { label: 'Caminhada', gps: true, met: 3.5 },
  bike: { label: 'Bike na rua', gps: true, met: 7 },
  esteira: { label: 'Esteira', gps: false, met: 4 },
  eliptico: { label: 'Elíptico', gps: false, met: 5 },
  escada: { label: 'Escada', gps: false, met: 8 },
  remo: { label: 'Remo', gps: false, met: 7 },
};

export const fmtKm = (m) => (m / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtDur = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`;
};
export const fmtPace = (sPerKm) => (sPerKm && Number.isFinite(sPerKm) ? `${Math.floor(sPerKm / 60)}'${String(Math.round(sPerKm % 60)).padStart(2, '0')}"` : '—');

/** Distância entre dois pontos em metros (haversine). */
function haversine([lat1, lon1], [lat2, lon2]) {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Traçado do percurso em SVG, normalizado para caber na caixa. */
export function RouteMap({ route, height = 180, animate }) {
  if (!route || route.length < 2) return null;
  const lats = route.map((p) => p[0]), lons = route.map((p) => p[1]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const midLat = (minLat + maxLat) / 2;
  const kx = Math.cos((midLat * Math.PI) / 180); // graus de longitude encolhem com a latitude
  const w = (maxLon - minLon) * kx || 1e-6, hgt = maxLat - minLat || 1e-6;
  const W = 320, H = height, pad = 14;
  const s = Math.min((W - 2 * pad) / w, (H - 2 * pad) / hgt);
  const ox = (W - w * s) / 2, oy = (H - hgt * s) / 2;
  const pts = route.map(([la, lo]) => [ox + (lo - minLon) * kx * s, H - (oy + (la - minLat) * s)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height, background: 'var(--surface-2)', borderRadius: 10 }} aria-label="Traçado do percurso">
      <path d={d} fill="none" stroke="var(--blue)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className={animate ? 'route-draw' : ''} />
      <circle cx={pts[0][0]} cy={pts[0][1]} r="5" fill="var(--green)" />
      <circle cx={pts.at(-1)[0]} cy={pts.at(-1)[1]} r="5" fill="var(--red)" />
    </svg>
  );
}

function useWakeLock(active) {
  useEffect(() => {
    if (!active || !navigator.wakeLock) return;
    let lock;
    const grab = () => navigator.wakeLock.request('screen').then((l) => (lock = l)).catch(() => {});
    grab();
    const vis = () => document.visibilityState === 'visible' && grab();
    document.addEventListener('visibilitychange', vis);
    return () => {
      document.removeEventListener('visibilitychange', vis);
      lock?.release().catch(() => {});
    };
  }, [active]);
}

/** Rastreador GPS: filtra leituras ruins, soma distância e ganho de elevação. */
function useGpsTracker() {
  const [state, setState] = useState({ status: 'idle', distance: 0, elapsed: 0, elevation: 0, accuracy: null, route: [], error: '' });
  const ref = useRef({ watch: null, last: null, startedAt: null, pausedAt: null, pausedTotal: 0, timer: null, lastAlt: null });

  const tick = useCallback(() => {
    const r = ref.current;
    if (!r.startedAt || r.pausedAt) return;
    setState((s) => ({ ...s, elapsed: Math.floor((Date.now() - r.startedAt - r.pausedTotal) / 1000) }));
  }, []);

  const onPos = useCallback((pos) => {
    const r = ref.current;
    if (r.pausedAt) return;
    const { latitude, longitude, accuracy, altitude } = pos.coords;
    const t = pos.timestamp || Date.now();
    setState((s) => ({ ...s, accuracy: Math.round(accuracy) }));
    if (accuracy > 35) return; // leitura ruim (prédios, início do GPS)
    const p = [latitude, longitude];
    if (r.last) {
      const d = haversine(r.last.p, p);
      const dt = (t - r.last.t) / 1000;
      if (d < 2) return; // ruído parado
      if (dt > 0 && d / dt > 12) return; // salto impossível (>43 km/h)
      let gain = 0;
      if (altitude != null && r.lastAlt != null && altitude - r.lastAlt > 1) gain = altitude - r.lastAlt;
      if (altitude != null) r.lastAlt = altitude;
      r.last = { p, t };
      setState((s) => ({ ...s, distance: s.distance + d, elevation: s.elevation + gain, route: [...s.route, p] }));
    } else {
      r.last = { p, t };
      if (altitude != null) r.lastAlt = altitude;
      setState((s) => ({ ...s, route: [p] }));
    }
  }, []);

  const start = useCallback(() => {
    if (!navigator.geolocation) return setState((s) => ({ ...s, status: 'error', error: 'Este aparelho não tem GPS disponível no navegador.' }));
    const r = ref.current;
    r.startedAt = Date.now();
    r.pausedTotal = 0;
    r.pausedAt = null;
    r.last = null;
    setState({ status: 'running', distance: 0, elapsed: 0, elevation: 0, accuracy: null, route: [], error: '' });
    r.watch = navigator.geolocation.watchPosition(onPos, (e) => setState((s) => ({ ...s, status: 'error', error: e.code === 1 ? 'Permita o acesso à localização para medir a distância.' : 'Sem sinal de GPS. Tente em área aberta.' })), {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 15000,
    });
    r.timer = setInterval(tick, 1000);
  }, [onPos, tick]);

  const pause = useCallback(() => {
    ref.current.pausedAt = Date.now();
    ref.current.last = null; // ao voltar, não soma o deslocamento da pausa
    setState((s) => ({ ...s, status: 'paused' }));
  }, []);
  const resume = useCallback(() => {
    const r = ref.current;
    r.pausedTotal += Date.now() - r.pausedAt;
    r.pausedAt = null;
    setState((s) => ({ ...s, status: 'running' }));
  }, []);
  const stop = useCallback(() => {
    const r = ref.current;
    if (r.watch != null) navigator.geolocation.clearWatch(r.watch);
    clearInterval(r.timer);
    r.watch = null;
    setState((s) => ({ ...s, status: 'done' }));
  }, []);
  useEffect(() => () => stop(), [stop]);
  return { ...state, start, pause, resume, stop, startedAt: ref.current.startedAt };
}

function Live({ kind, weight, onDone, onCancel }) {
  const t = useGpsTracker();
  const toast = useToast();
  useEffect(() => {
    t.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useWakeLock(t.status === 'running');
  const pace = t.distance > 50 ? t.elapsed / (t.distance / 1000) : null;
  const kcal = Math.round((KINDS[kind].met * (weight || 70) * t.elapsed) / 3600);
  const km = Math.floor(t.distance / 1000);
  const lastKm = useRef(0);
  useEffect(() => {
    if (km > lastKm.current) {
      lastKm.current = km;
      navigator.vibrate?.(200);
      toast(`${km} km. Ritmo ${fmtPace(pace)} por km`);
    }
  }, [km, pace, toast]);

  async function finish() {
    t.stop();
    if (t.elapsed < 60) {
      toast('Menos de 1 minuto. Atividade não registrada.', 'err');
      return onCancel();
    }
    onDone({ kind, mode: 'gps', distance_m: Math.round(t.distance), duration_s: t.elapsed, elevation_m: Math.round(t.elevation), route: t.route, started_at: new Date(t.startedAt).toISOString().slice(0, 19).replace('T', ' ') });
  }

  return (
    <div className="app-section">
      <div className="panel panel-pad stack cardio-live">
        <div className="spread">
          <span className="tag">{KINDS[kind].label}, GPS</span>
          <span className="tiny faint">{t.accuracy == null ? 'procurando satélites…' : t.accuracy > 35 ? `sinal fraco (±${t.accuracy} m)` : `sinal bom (±${t.accuracy} m)`}</span>
        </div>
        {t.error && <div className="alert red">{t.error}</div>}
        <div style={{ textAlign: 'center' }}>
          <span className="num cardio-big">{fmtKm(t.distance)}</span>
          <div className="muted">quilômetros</div>
        </div>
        <div className="grid-3" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[
            [fmtDur(t.elapsed), 'tempo'],
            [fmtPace(pace), 'ritmo /km'],
            [kcal, 'kcal'],
          ].map(([v, l]) => (
            <div key={l} className="panel" style={{ padding: '10px 12px', background: 'var(--surface-2)', boxShadow: 'none' }}>
              <b className="num" style={{ fontSize: 22, display: 'block' }}>
                {v}
              </b>
              <span className="tiny muted">{l}</span>
            </div>
          ))}
        </div>
        <RouteMap route={t.route} height={150} />
        <div className="row">
          {t.status === 'running' ? (
            <button className="btn lg grow" onClick={t.pause}>
              Pausar
            </button>
          ) : (
            <button className="btn lg grow" onClick={t.resume} disabled={t.status === 'error' && !t.route.length}>
              Continuar
            </button>
          )}
          <button className="btn go lg grow" onClick={finish}>
            Concluir
          </button>
        </div>
        <button className="btn ghost sm" onClick={() => (t.stop(), onCancel())}>
          Descartar atividade
        </button>
      </div>
    </div>
  );
}

function Manual({ kind, weight, onDone, onCancel }) {
  const [min, setMin] = useState(30);
  const [km, setKm] = useState(kind === 'esteira' ? '3,0' : '');
  const dist = Math.round(Number(String(km).replace(',', '.')) * 1000) || 0;
  const kcal = Math.round((KINDS[kind].met * (weight || 70) * min) / 60);
  return (
    <div className="app-section">
      <form
        className="panel panel-pad stack"
        onSubmit={(e) => {
          e.preventDefault();
          onDone({ kind, mode: 'manual', distance_m: dist, duration_s: Number(min) * 60 });
        }}
      >
        <span className="tag">{KINDS[kind].label}, registro manual</span>
        <p className="small muted">Copie do visor do aparelho ao terminar.</p>
        <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <label className="field">
            <span>Minutos</span>
            <input className="input" type="number" min="1" max="360" value={min} onChange={(e) => setMin(e.target.value)} required />
          </label>
          <label className="field">
            <span>Distância (km)</span>
            <input className="input" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} placeholder="opcional" />
          </label>
        </div>
        <div className="muted small">
          Estimativa: <b>{kcal} kcal</b>
          {dist ? `, ritmo ${fmtPace((min * 60) / (dist / 1000))} por km` : ''}
        </div>
        <div className="row">
          <button type="button" className="btn grow" onClick={onCancel}>
            Voltar
          </button>
          <button className="btn go grow">Registrar</button>
        </div>
      </form>
    </div>
  );
}

function WeightPrompt({ onSaved }) {
  const [w, setW] = useState('');
  const [err, setErr] = useState('');
  return (
    <form
      className="alert blue stack"
      style={{ gap: 8 }}
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await put('/me/profile', { weight_kg: Number(String(w).replace(',', '.')) });
          onSaved();
        } catch (ex) {
          setErr(ex.message);
        }
      }}
    >
      <span>Informe seu peso para a estimativa de calorias ficar certa.</span>
      <div className="row">
        <input className="input" inputMode="decimal" placeholder="kg" value={w} onChange={(e) => setW(e.target.value)} style={{ width: 100 }} required />
        <button className="btn sm">Salvar</button>
      </div>
      {err && <span className="small" style={{ color: 'var(--red)' }}>{err}</span>}
    </form>
  );
}

export default function Cardio() {
  const toast = useToast();
  const { data, error, reload } = useData('/me/cardio');
  const [kind, setKind] = useState('corrida');
  const [phase, setPhase] = useState('idle'); // idle | live | manual | summary
  const [summary, setSummary] = useState(null);
  const [share, setShare] = useState(null);
  const [detail, setDetail] = useState(null);

  async function save(payload) {
    try {
      const r = await post('/me/cardio', payload);
      setSummary({ ...payload, ...r });
      setPhase('summary');
      reload();
      if (r.record) navigator.vibrate?.([100, 60, 100, 60, 300]);
    } catch (e) {
      toast(e.message, 'err');
      setPhase('idle');
    }
  }

  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Loading />;

  if (phase === 'live') return <Live kind={kind} weight={data.weight_kg} onDone={save} onCancel={() => setPhase('idle')} />;
  if (phase === 'manual') return <Manual kind={kind} weight={data.weight_kg} onDone={save} onCancel={() => setPhase('idle')} />;

  if (phase === 'summary' && summary) {
    const s = summary;
    const stats = [
      [fmtKm(s.distance_m), 'km'],
      [fmtDur(s.duration_s), 'tempo'],
      [fmtPace(s.avg_pace_s_km), 'ritmo /km'],
      [String(s.kcal), 'kcal'],
    ];
    return (
      <div className="app-section stack">
        <div className="panel panel-pad stack" style={{ textAlign: 'center' }}>
          {s.record && <div className="alert green">Recorde pessoal de distância em {KINDS[s.kind].label.toLowerCase()}.</div>}
          <div className="small muted">{KINDS[s.kind].label} registrada</div>
          <span className="num cardio-big">{fmtKm(s.distance_m)}</span>
          <div className="muted" style={{ marginTop: -8 }}>quilômetros</div>
          <div className="grid-3" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {stats.slice(1).map(([v, l]) => (
              <div key={l}>
                <b className="num" style={{ fontSize: 22, display: 'block' }}>
                  {v}
                </b>
                <span className="tiny muted">{l}</span>
              </div>
            ))}
          </div>
          {s.route && <RouteMap route={s.route} animate />}
          <button className="btn primary lg" onClick={() => setShare({ kind: 'cardio', refId: s.id, title: s.record ? 'Recorde pessoal' : `${KINDS[s.kind].label} feita`, stats, route: s.route })}>
            Postar no Instagram
          </button>
          <button className="btn ghost" onClick={() => setPhase('idle')}>
            Voltar
          </button>
        </div>
        {share && <ShareCard {...share} onClose={() => setShare(null)} />}
      </div>
    );
  }

  const m = data.month;
  return (
    <>
      <div className="app-section">
        <div className="panel panel-pad stack">
          {!data.weight_kg && <WeightPrompt onSaved={reload} />}
          <h3>Começar cardio</h3>
          <div className="kind-grid">
            {Object.entries(KINDS).map(([k, v]) => (
              <button key={k} className={`kind ${kind === k ? 'on' : ''}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
                <b>{v.label}</b>
                <span className="tiny">{v.gps ? 'GPS' : 'manual'}</span>
              </button>
            ))}
          </div>
          {KINDS[kind].gps ? (
            <>
              <button className="btn go lg" onClick={() => setPhase('live')}>
                Iniciar com GPS
              </button>
              <p className="tiny faint" style={{ textAlign: 'center' }}>
                Mantenha a tela ligada; o app segura o bloqueio sozinho. Em locais fechados, prefira o registro manual.{' '}
                <button className="btn ghost sm" style={{ display: 'inline-flex', height: 24, padding: '0 6px' }} onClick={() => setPhase('manual')}>
                  Registrar à mão
                </button>
              </p>
            </>
          ) : (
            <button className="btn go lg" onClick={() => setPhase('manual')}>
              Registrar {KINDS[kind].label.toLowerCase()}
            </button>
          )}
        </div>
      </div>

      <div className="app-section">
        <div className="panel panel-pad stack">
          <div className="spread">
            <h3>Este mês</h3>
            <span className="small muted">{m.sessions} atividades</span>
          </div>
          <div className="grid-3" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[
              [fmtKm(m.distance_m), 'km'],
              [fmtDur(m.duration_s), 'tempo'],
              [m.kcal, 'kcal'],
            ].map(([v, l]) => (
              <div key={l}>
                <b className="num" style={{ fontSize: 22, display: 'block' }}>
                  {v}
                </b>
                <span className="tiny muted">{l}</span>
              </div>
            ))}
          </div>
          {data.best_distance_m > 0 && (
            <div className="small muted">
              Sua maior distância correndo ou caminhando: <b>{fmtKm(data.best_distance_m)} km</b>
            </div>
          )}
        </div>
      </div>

      <div className="app-section">
        <h3 style={{ margin: '4px 4px 8px' }}>Histórico</h3>
        <div className="panel">
          {data.items.length ? (
            <ul className="list-plain">
              {data.items.map((s) => (
                <li key={s.id} style={{ alignItems: 'center', cursor: s.mode === 'gps' ? 'pointer' : 'default' }} onClick={() => s.mode === 'gps' && get(`/me/cardio/${s.id}`).then(setDetail)}>
                  <span>
                    <b>{KINDS[s.kind]?.label || s.kind}</b> <span className="tiny muted">{s.mode === 'gps' ? 'GPS' : 'manual'}</span>
                    <div className="tiny muted">
                      {dateShort(s.started_at)} {time(s.started_at)}
                    </div>
                  </span>
                  <span className="right">
                    <b className="tnum">{s.distance_m ? `${fmtKm(s.distance_m)} km` : fmtDur(s.duration_s)}</b>
                    <div className="tiny muted">
                      {s.distance_m ? `${fmtDur(s.duration_s)}, ` : ''}
                      {s.kcal} kcal
                    </div>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">
              <strong>Nenhum cardio ainda.</strong>Registre a primeira corrida, caminhada ou esteira.
            </div>
          )}
        </div>
      </div>
      {detail && (
        <div className="scrim sheet-scrim" onMouseDown={(e) => e.target === e.currentTarget && setDetail(null)}>
          <div className="sheet" role="dialog" aria-modal="true">
            <div className="sheet-grip" />
            <div className="sheet-body stack">
              <div className="spread">
                <h3>
                  {KINDS[detail.kind].label}, {date(detail.started_at)}
                </h3>
                <button className="btn ghost sm" onClick={() => setDetail(null)} aria-label="Fechar">
                  <Icon name="x" />
                </button>
              </div>
              <RouteMap route={detail.route} animate />
              <div className="grid-3" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {[
                  [`${fmtKm(detail.distance_m)} km`, 'distância'],
                  [fmtDur(detail.duration_s), 'tempo'],
                  [fmtPace(detail.avg_pace_s_km), 'ritmo /km'],
                ].map(([v, l]) => (
                  <div key={l}>
                    <b className="num" style={{ fontSize: 20, display: 'block' }}>
                      {v}
                    </b>
                    <span className="tiny muted">{l}</span>
                  </div>
                ))}
              </div>
              <button
                className="btn primary"
                onClick={() =>
                  (setDetail(null),
                  setShare({ kind: 'cardio', refId: detail.id, title: `${KINDS[detail.kind].label} feita`, route: detail.route, stats: [[fmtKm(detail.distance_m), 'km'], [fmtDur(detail.duration_s), 'tempo'], [fmtPace(detail.avg_pace_s_km), 'ritmo /km'], [String(detail.kcal), 'kcal']] }))
                }
              >
                Postar no Instagram
              </button>
            </div>
          </div>
        </div>
      )}
      {share && <ShareCard {...share} onClose={() => setShare(null)} />}
    </>
  );
}
