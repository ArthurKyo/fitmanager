import { useEffect, useState } from 'react';
import { asset, get } from '../api.js';
import { Icon, Loading } from '../ui/kit.jsx';

const MUSCLE_LABEL = {
  peitoral: 'Peitoral', deltoide: 'Ombros', biceps: 'Bíceps', triceps: 'Tríceps', antebraco: 'Antebraço', abdomen: 'Abdômen', obliquo: 'Oblíquos',
  quadriceps: 'Quadríceps', adutor: 'Adutores', panturrilha: 'Panturrilha', trapezio: 'Trapézio', dorsal: 'Dorsal', lombar: 'Lombar', gluteo: 'Glúteos',
  posterior: 'Posterior de coxa', romboide: 'Romboides',
};

/** Mapa corporal, frente e costas. Regiões simples; as ativas ficam em destaque. */
export function BodyMap({ active = [] }) {
  const on = (m) => (active.includes(m) ? 'var(--red)' : 'var(--rule)');
  const skin = 'var(--surface-2)';
  const Body = ({ back }) => (
    <svg viewBox="0 0 120 260" width="110" height="240" aria-hidden="true">
      {/* silhueta */}
      <circle cx="60" cy="22" r="14" fill={skin} />
      <path d="M38 44 h44 l10 70 l-6 2 l-8 -46 v60 l8 100 h-14 l-12 -84 l-12 84 h-14 l8 -100 v-60 l-8 46 l-6 -2 z" fill={skin} />
      {back ? (
        <>
          <path d="M44 46 h32 l-16 26 z" fill={on('trapezio')} />
          <ellipse cx="40" cy="54" rx="7" ry="8" fill={on('deltoide')} />
          <ellipse cx="80" cy="54" rx="7" ry="8" fill={on('deltoide')} />
          <rect x="51" y="58" width="18" height="18" rx="3" fill={on('romboide')} />
          <path d="M42 62 l12 10 v30 l-12 -8 z" fill={on('dorsal')} />
          <path d="M78 62 l-12 10 v30 l12 -8 z" fill={on('dorsal')} />
          <rect x="50" y="102" width="20" height="16" rx="3" fill={on('lombar')} />
          <ellipse cx="35" cy="80" rx="5" ry="14" fill={on('triceps')} />
          <ellipse cx="85" cy="80" rx="5" ry="14" fill={on('triceps')} />
          <ellipse cx="51" cy="128" rx="10" ry="12" fill={on('gluteo')} />
          <ellipse cx="69" cy="128" rx="10" ry="12" fill={on('gluteo')} />
          <ellipse cx="50" cy="168" rx="8" ry="26" fill={on('posterior')} />
          <ellipse cx="70" cy="168" rx="8" ry="26" fill={on('posterior')} />
          <ellipse cx="48" cy="220" rx="6" ry="18" fill={on('panturrilha')} />
          <ellipse cx="72" cy="220" rx="6" ry="18" fill={on('panturrilha')} />
        </>
      ) : (
        <>
          <ellipse cx="40" cy="54" rx="7" ry="8" fill={on('deltoide')} />
          <ellipse cx="80" cy="54" rx="7" ry="8" fill={on('deltoide')} />
          <path d="M46 52 h12 v22 q-10 0 -14 -8 z" fill={on('peitoral')} />
          <path d="M74 52 h-12 v22 q10 0 14 -8 z" fill={on('peitoral')} />
          <ellipse cx="35" cy="80" rx="5" ry="14" fill={on('biceps')} />
          <ellipse cx="85" cy="80" rx="5" ry="14" fill={on('biceps')} />
          <ellipse cx="31" cy="106" rx="4" ry="12" fill={on('antebraco')} />
          <ellipse cx="89" cy="106" rx="4" ry="12" fill={on('antebraco')} />
          <rect x="52" y="78" width="16" height="34" rx="4" fill={on('abdomen')} />
          <rect x="45" y="82" width="6" height="28" rx="3" fill={on('obliquo')} />
          <rect x="69" y="82" width="6" height="28" rx="3" fill={on('obliquo')} />
          <ellipse cx="49" cy="165" rx="9" ry="28" fill={on('quadriceps')} />
          <ellipse cx="71" cy="165" rx="9" ry="28" fill={on('quadriceps')} />
          <ellipse cx="57" cy="145" rx="3" ry="14" fill={on('adutor')} />
          <ellipse cx="63" cy="145" rx="3" ry="14" fill={on('adutor')} />
          <ellipse cx="48" cy="220" rx="5" ry="16" fill={on('panturrilha')} opacity="0.6" />
          <ellipse cx="72" cy="220" rx="5" ry="16" fill={on('panturrilha')} opacity="0.6" />
        </>
      )}
    </svg>
  );
  return (
    <div className="row" style={{ justifyContent: 'center', gap: 18 }}>
      <div style={{ textAlign: 'center' }}>
        <Body />
        <div className="tiny faint">frente</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <Body back />
        <div className="tiny faint">costas</div>
      </div>
    </div>
  );
}

/**
 * Boneco articulado em vista lateral (de frente para a direita). Ângulos em graus, a partir da vertical.
 * Convenção: torso desenhado para cima; braços e pernas para baixo. Valor negativo leva o segmento para frente.
 * Cada padrão tem duas poses (A e B); a animação vai e volta.
 */
const POSES = {
  agachar: { A: { torso: 0, ua: -90, fa: 0, th: 0, sh: 0 }, B: { torso: 35, ua: -115, fa: 0, th: -85, sh: 85 } },
  dobradica: { A: { torso: 0, ua: 0, fa: 0, th: 0, sh: 0 }, B: { torso: 80, ua: -80, fa: 0, th: -15, sh: 12 } },
  gluteo: { A: { torso: 60, ua: -60, fa: 0, th: -20, sh: 15 }, B: { torso: 0, ua: 0, fa: 0, th: 0, sh: 0 } },
  empurrar_h: { A: { torso: 0, ua: -60, fa: 130, th: 0, sh: 0 }, B: { torso: 0, ua: -90, fa: 0, th: 0, sh: 0 } },
  empurrar_v: { A: { torso: 0, ua: -95, fa: -85, th: 0, sh: 0 }, B: { torso: 0, ua: -172, fa: 0, th: 0, sh: 0 } },
  puxar_h: { A: { torso: 45, ua: -45, fa: 0, th: -10, sh: 10 }, B: { torso: 45, ua: 30, fa: -100, th: -10, sh: 10 } },
  puxar_v: { A: { torso: 0, ua: -178, fa: 0, th: 0, sh: 0 }, B: { torso: 0, ua: -110, fa: -90, th: 0, sh: 0 } },
  rosca: { A: { torso: 0, ua: 0, fa: 0, th: 0, sh: 0 }, B: { torso: 0, ua: 5, fa: -140, th: 0, sh: 0 } },
  triceps: { A: { torso: 5, ua: 10, fa: -95, th: 0, sh: 0 }, B: { torso: 5, ua: 10, fa: 0, th: 0, sh: 0 } },
  lateral: { A: { torso: 0, ua: 0, fa: 0, th: 0, sh: 0 }, B: { torso: 0, ua: -92, fa: 0, th: 0, sh: 0 } },
  core: { A: { torso: 92, ua: -92, fa: -90, th: 90, sh: 0 }, B: { torso: 90, ua: -90, fa: -90, th: 90, sh: 0 } },
  panturrilha: { A: { torso: 0, ua: 0, fa: 0, th: 0, sh: 0, lift: 0 }, B: { torso: 0, ua: 0, fa: 0, th: 0, sh: 0, lift: -10 } },
  cardio: { A: { torso: 8, ua: -60, fa: -90, th: -40, sh: 60 }, B: { torso: 8, ua: 40, fa: -90, th: 30, sh: 0 }, alternate: true },
};

function Seg({ len, from, to, children, dur, cx = 0, cy = 0, stroke }) {
  const vals = `${from} ${cx} ${cy}; ${to} ${cx} ${cy}; ${from} ${cx} ${cy}`;
  return (
    <g>
      <animateTransform attributeName="transform" type="rotate" values={vals} dur={dur} repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.2 1; 0.4 0 0.2 1" />
      <line x1="0" y1="0" x2="0" y2={len} stroke={stroke} strokeWidth="9" strokeLinecap="round" />
      <g transform={`translate(0 ${len})`}>{children}</g>
    </g>
  );
}

export function Figure({ pattern = 'agachar', size = 220 }) {
  const P = POSES[pattern] || POSES.agachar;
  const dur = pattern === 'cardio' ? '0.9s' : pattern === 'core' ? '3s' : '2.6s';
  const ink = 'var(--ink)';
  const far = 'var(--ink-3)';
  const limb = (side, phase) => {
    const a = phase ? P.B : P.A;
    const b = phase ? P.A : P.B;
    const col = side === 'near' ? ink : far;
    return (
      <>
        {/* perna */}
        <Seg len={44} from={a.th} to={b.th} dur={dur} stroke={col}>
          <Seg len={44} from={a.sh} to={b.sh} dur={dur} stroke={col}>
            <line x1="0" y1="0" x2="14" y2="0" stroke={col} strokeWidth="9" strokeLinecap="round" />
          </Seg>
        </Seg>
      </>
    );
  };
  const arm = (side, phase) => {
    const a = phase ? P.B : P.A;
    const b = phase ? P.A : P.B;
    const col = side === 'near' ? ink : far;
    return (
      <Seg len={30} from={a.ua} to={b.ua} dur={dur} stroke={col}>
        <Seg len={28} from={a.fa} to={b.fa} dur={dur} stroke={col}>
          <circle r="5" fill={col} />
        </Seg>
      </Seg>
    );
  };
  const alt = !!P.alternate;
  return (
    <svg viewBox="0 0 220 230" width={size} height={size} aria-label={`Animação do movimento: ${pattern}`} role="img">
      <line x1="20" y1="212" x2="200" y2="212" stroke="var(--rule)" strokeWidth="2" />
      <g transform="translate(100 124)">
        {P.A.lift !== undefined && <animateTransform attributeName="transform" type="translate" values={`100 ${124 + P.A.lift}; 100 ${124 + P.B.lift}; 100 ${124 + P.A.lift}`} dur={dur} repeatCount="indefinite" />}
        {/* perna de trás */}
        {limb('far', alt)}
        {/* torso + cabeça + braços */}
        <Seg len={-54} from={P.A.torso} to={P.B.torso} dur={dur} stroke={ink}>
          <circle cy="-16" r="13" fill={ink} />
          {arm('far', alt)}
          {arm('near', false)}
        </Seg>
        {/* perna da frente */}
        {limb('near', false)}
      </g>
    </svg>
  );
}

/** Pessoa real nas posições inicial e final; alterna sozinha e aceita arrastar o controle. */
export function HumanDemo({ photos, name, fallback }) {
  const [pos, setPos] = useState(0); // 0 = início, 1 = fim
  const [auto, setAuto] = useState(true);
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => setPos((p) => (p === 0 ? 1 : 0)), 1400);
    return () => clearInterval(t);
  }, [auto]);
  if (broken || !photos) return fallback;
  return (
    <div className="demo">
      <div className="demo-stage">
        {photos.map((src, i) => (
          <img key={src} src={asset(src)} alt={`${name}, posição ${i === 0 ? 'inicial' : 'final'}`} style={{ opacity: i === pos ? 1 : 0 }} onError={() => setBroken(true)} />
        ))}
        <span className="demo-tag">{pos === 0 ? 'Posição inicial' : 'Posição final'}</span>
      </div>
      <div className="demo-ctrl">
        <button className={`btn sm ${pos === 0 ? 'primary' : ''}`} onClick={() => (setAuto(false), setPos(0))}>
          Início
        </button>
        <button className="btn sm ghost" onClick={() => setAuto((a) => !a)} aria-label={auto ? 'Pausar' : 'Repetir'}>
          <i className={`bi ${auto ? 'bi-pause-fill' : 'bi-play-fill'}`} aria-hidden="true" />
        </button>
        <button className={`btn sm ${pos === 1 ? 'primary' : ''}`} onClick={() => (setAuto(false), setPos(1))}>
          Fim
        </button>
      </div>
    </div>
  );
}

const PATTERN_LABEL = {
  agachar: 'Agachar', dobradica: 'Dobradiça de quadril', gluteo: 'Extensão de quadril', empurrar_h: 'Empurrar à frente', empurrar_v: 'Empurrar acima da cabeça',
  puxar_h: 'Puxar para o tronco', puxar_v: 'Puxar de cima', rosca: 'Flexão de cotovelo', triceps: 'Extensão de cotovelo', lateral: 'Elevação', core: 'Estabilização', panturrilha: 'Flexão plantar', cardio: 'Cardio',
};

export default function ExerciseSheet({ exerciseId, onClose }) {
  const [ex, setEx] = useState(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('como');
  useEffect(() => {
    get(`/me/exercises/${exerciseId}`).then(setEx, (e) => setErr(e.message));
  }, [exerciseId]);
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', k);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  const g = ex?.guide;
  const yt = ex?.video_url && /(youtu\.be\/|v=)([\w-]{11})/.exec(ex.video_url)?.[2];
  return (
    <div className="scrim sheet-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={ex?.name || 'Exercício'}>
        <div className="sheet-grip" />
        {err && <div className="alert red">{err}</div>}
        {!ex ? (
          <Loading />
        ) : (
          <>
            <div className="spread" style={{ padding: '0 18px' }}>
              <div>
                <div className="small muted">
                  {ex.muscle}
                  {ex.equipment ? `, ${ex.equipment}` : ''}
                </div>
                <h2 style={{ fontSize: 22 }}>{ex.name}</h2>
                {ex.prescription && (
                  <div className="small muted">
                    Sua ficha: {ex.prescription.sets} x {ex.prescription.reps}
                    {ex.prescription.load_kg ? `, ${String(ex.prescription.load_kg).replace('.', ',')} kg` : ''}
                  </div>
                )}
              </div>
              <button className="btn ghost sm" onClick={onClose} aria-label="Fechar">
                <Icon name="x" />
              </button>
            </div>
            {!g ? (
              <div className="empty">Este exercício ainda não tem guia. Peça ao professor para demonstrar.</div>
            ) : (
              <>
                <div className="tabs" style={{ padding: '0 10px', marginTop: 8 }}>
                  {[
                    ['como', 'Movimento'],
                    ['musculos', 'Músculos'],
                    ['passos', 'Passo a passo'],
                  ].map(([k, l]) => (
                    <button key={k} aria-selected={tab === k} onClick={() => setTab(k)}>
                      {l}
                    </button>
                  ))}
                </div>
                <div className="sheet-body">
                  {tab === 'como' && (
                    <div className="stack" style={{ justifyItems: 'center' }}>
                      {yt ? (
                        <iframe
                          title={`Vídeo: ${ex.name}`}
                          src={`https://www.youtube-nocookie.com/embed/${yt}?rel=0`}
                          style={{ width: '100%', aspectRatio: '16/9', border: 0, borderRadius: 10 }}
                          allow="accelerometer; encrypted-media; picture-in-picture"
                          allowFullScreen
                        />
                      ) : (
                        <HumanDemo photos={g.photos} name={ex.name} fallback={<Figure pattern={g.pattern} />} />
                      )}
                      <span className="tag">{PATTERN_LABEL[g.pattern] || g.pattern}</span>
                      <p className="small muted" style={{ textAlign: 'center' }}>
                        Ritmo sugerido: 2 segundos para descer, 1 para subir. {g.breathing}
                      </p>
                    </div>
                  )}
                  {tab === 'musculos' && (
                    <div className="stack" style={{ justifyItems: 'center' }}>
                      <BodyMap active={g.muscles} />
                      <div className="row wrap" style={{ justifyContent: 'center' }}>
                        {g.muscles.map((m, i) => (
                          <span key={m} className={`tag ${i === 0 ? 'red' : ''}`}>
                            {MUSCLE_LABEL[m] || m}
                          </span>
                        ))}
                      </div>
                      <p className="small muted" style={{ textAlign: 'center' }}>Em vermelho, o músculo principal. Os outros ajudam no movimento.</p>
                    </div>
                  )}
                  {tab === 'passos' && (
                    <div className="stack">
                      <ol className="steps">
                        {g.steps.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ol>
                      <div className="alert yellow">
                        <b>Evite:</b> {g.mistakes.join(' ')}
                      </div>
                      <p className="small muted">{g.breathing}</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
