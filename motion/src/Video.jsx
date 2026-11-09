import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import durations from '../public/audio/durations.json';
import { T, d, b, Line, useRise, useFade, Display, Phone, Tag } from './theme.jsx';

export const FPS = 30;
const PAD = 0.9; // respiro depois de cada frase, em segundos
const SCENE_FRAMES = durations.durations.map((s) => Math.round((s + PAD) * FPS));
const START = SCENE_FRAMES.reduce((acc, f, i) => (acc.push(i ? acc[i - 1] + SCENE_FRAMES[i - 1] : 0), acc), []);
export const TOTAL_FRAMES = START.at(-1) + SCENE_FRAMES.at(-1) + FPS;
const TRILHA = false; // true quando existir public/audio/trilha.mp3

/** Filmagem de fundo com zoom lento e escurecimento. */
function Footage({ src, dark = 0.72, from = 0 }) {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, 600], [1.04, 1.16], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <OffthreadVideo src={staticFile(src)} muted startFrom={from} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${scale})`, filter: 'saturate(0.7) contrast(1.08) brightness(0.85)' }} />
      <AbsoluteFill style={{ background: `linear-gradient(180deg, rgba(0,0,0,${dark}) 0%, rgba(0,0,0,${dark - 0.2}) 50%, rgba(0,0,0,${dark + 0.1}) 100%)` }} />
    </AbsoluteFill>
  );
}

const Scene = ({ children, frames }) => {
  const opacity = useFade(frames, 14);
  return <AbsoluteFill style={{ opacity, fontFamily: T.body, color: T.fg }}>{children}</AbsoluteFill>;
};

// ---------------------------------------------------------------- 1. Abertura
function S1() {
  return (
    <>
      <Footage src="video/barra.mp4" dark={0.7} />
      <AbsoluteFill style={{ padding: '0 160px', justifyContent: 'center' }}>
        <h1 style={{ ...d(188), margin: 0, maxWidth: 1200 }}>
          <Line delay={6}>A catraca</Line>
          <Line delay={12}>sabe quem</Line>
          <Line delay={18}>
            <span style={{ color: T.lime }}>pagou.</span>
          </Line>
        </h1>
        <div style={{ ...b(34), color: T.fg2, maxWidth: 900, marginTop: 36, ...useRise(40) }}>Gestão de academia com a catraca ligada ao financeiro.</div>
      </AbsoluteFill>
    </>
  );
}

// ---------------------------------------------------------------- 2. Catraca
const PASSES = [
  { ok: true, name: 'Mariana Albuquerque', msg: 'Bom treino, Mariana!', how: 'Facial', t: '18:42' },
  { ok: false, name: 'Rafael Teixeira', msg: 'Vencida em 27/10. Pague no app ou na recepção', how: 'Digital', t: '18:43' },
  { ok: true, name: 'Helena Prado', msg: 'Helena, mensalidade vence em 11/11', how: 'QR do app', t: '18:43' },
  { ok: false, name: 'Caio Ramos', msg: 'Seu plano libera das 6h às 16h', how: 'Digital', t: '18:44' },
];
function S2({ frames }) {
  const frame = useCurrentFrame();
  const i = Math.min(PASSES.length - 1, Math.floor(frame / (frames / PASSES.length)));
  const p = PASSES[i];
  const local = frame - i * (frames / PASSES.length);
  const pop = spring({ frame: local, fps: FPS, config: { damping: 18, stiffness: 160 } });
  return (
    <>
      <Footage src="video/levantamento.mp4" dark={0.74} />
      <AbsoluteFill style={{ flexDirection: 'row', alignItems: 'center', padding: '0 140px', gap: 80 }}>
        <div style={{ flex: 1 }}>
          <div style={{ ...d(96), ...useRise(4) }}>Quem está em dia, entra.</div>
          <div style={{ ...d(96), color: T.lime, ...useRise(12) }}>Quem atrasou, vê o motivo.</div>
          <div style={{ ...b(28), color: T.fg2, marginTop: 28, maxWidth: 640, ...useRise(22) }}>Digital, reconhecimento facial, cartão ou o QR do app. A decisão sai do financeiro, não da recepção.</div>
        </div>
        <div style={{ transform: `scale(${0.96 + pop * 0.04})`, ...useRise(10, 60) }}>
          <Display {...p} time={p.t} />
        </div>
      </AbsoluteFill>
    </>
  );
}

// ---------------------------------------------------------------- 3. Pix
function PixScreen({ paid }) {
  const t = spring({ frame: useCurrentFrame() - 3, fps: FPS, config: { damping: 200 } });
  return (
    <div style={{ padding: '70px 26px 26px' }}>
      <div style={{ ...b(15), color: T.fg2 }}>Anual fidelidade, parcela 8 de 12</div>
      <div style={{ ...d(64, 900), marginTop: 10 }}>R$ 109,90</div>
      {paid ? (
        <div style={{ marginTop: 26, background: 'rgba(87,208,138,0.14)', borderLeft: `3px solid ${T.green}`, color: T.green, padding: 18, borderRadius: 8, ...b(19, 600), transform: `scale(${t})` }}>
          Pagamento confirmado. A catraca já libera sua entrada.
        </div>
      ) : (
        <>
          <div style={{ marginTop: 22, background: '#fff', borderRadius: 16, padding: 18, display: 'flex', justifyContent: 'center' }}>
            <svg viewBox="0 0 21 21" width="230" height="230" shapeRendering="crispEdges">
              {Array.from({ length: 441 }, (_, i) => {
                const x = i % 21, y = Math.floor(i / 21);
                const f = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
                const on = f ? !(x % 6 === 1 || x % 6 === 5 || y % 6 === 1 || y % 6 === 5) && x % 7 !== 6 && y % 7 !== 6 : (x * 7 + y * 13 + x * y) % 3 === 0;
                return on ? <rect key={i} x={x} y={y} width="1" height="1" fill="#000" /> : null;
              })}
            </svg>
          </div>
          <div style={{ marginTop: 18, background: T.lime, color: '#000', borderRadius: 999, padding: '16px 0', textAlign: 'center', ...d(22, 800), letterSpacing: '0.04em' }}>Copiar Pix copia e cola</div>
          <div style={{ ...b(14), color: T.fg2, marginTop: 14, textAlign: 'center' }}>Aguardando o banco. A confirmação chega sozinha.</div>
        </>
      )}
    </div>
  );
}
function S3({ frames }) {
  const frame = useCurrentFrame();
  const flip = Math.round(frames * 0.48);
  const paid = frame >= flip;
  const kick = spring({ frame: frame - flip, fps: FPS, config: { damping: 14, stiffness: 180 } });
  return (
    <>
      <Footage src="video/anilhas.mp4" dark={0.76} />
      <AbsoluteFill style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 110 }}>
        <div style={useRise(6, 60)}>
          <Phone>
            <Sequence from={paid ? flip : 0} layout="none">
              <PixScreen paid={paid} />
            </Sequence>
          </Phone>
        </div>
        <div style={{ ...useRise(14, 60), transform: `${useRise(14, 60).transform} scale(${1 + (paid ? kick * 0.03 : 0)})` }}>
          <Display ok={paid} name="Rafael Teixeira" msg={paid ? 'Pix confirmado. Bom treino, Rafael!' : 'Vencida em 27/10. Pague no app ou na recepção'} how={paid ? 'QR do app' : 'Digital'} time={paid ? '18:46' : '18:43'} width={700} scale={0.92} />
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: 'flex-end', padding: '0 0 70px', alignItems: 'center' }}>
        <div style={{ ...d(64), ...useRise(30) }}>
          Pix no app. <span style={{ color: T.lime }}>Catraca libera na hora.</span>
        </div>
      </AbsoluteFill>
    </>
  );
}

// ---------------------------------------------------------------- 4. Painel
function Count({ to, prefix = '', decimals = 0, delay = 0 }) {
  const frame = useCurrentFrame();
  const v = interpolate(frame - delay, [0, 50], [0, to], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: (x) => 1 - Math.pow(1 - x, 3) });
  return `${prefix}${v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}
function S4() {
  const frame = useCurrentFrame();
  const hours = [2, 5, 9, 14, 12, 7, 4, 3, 5, 8, 11, 16, 19, 15, 9, 4];
  const max = Math.max(...hours);
  const grow = interpolate(frame, [12, 50], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const feed = [
    ['18:46', 'Rafael Teixeira', 'Pix confirmado. Bom treino, Rafael!', true],
    ['18:45', 'Bruno Siqueira', 'Feliz aniversário, Bruno!', true],
    ['18:44', 'Caio Ramos', 'Seu plano libera das 6h às 16h', false],
    ['18:43', 'Helena Prado', 'Helena, mensalidade vence em 11/11', true],
  ];
  return (
    <>
      <Footage src="video/barra.mp4" dark={0.8} from={90} />
      <AbsoluteFill style={{ padding: '90px 140px', flexDirection: 'row', gap: 50, alignItems: 'stretch' }}>
        <div style={{ flex: 1.3, display: 'flex', flexDirection: 'column', gap: 26 }}>
          <div style={{ ...d(84), ...useRise(2) }}>
            Um painel só, <span style={{ color: T.lime }}>para o dono.</span>
          </div>
          <div style={{ background: 'rgba(17,17,17,0.85)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 28, padding: 36, flex: 1, display: 'flex', flexDirection: 'column', gap: 26, ...useRise(10, 60) }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 56 }}>
              <div>
                <div style={{ ...d(150), lineHeight: 0.85 }}>
                  <Count to={47} delay={10} />
                  <span style={{ fontSize: 40, color: T.fg3, fontWeight: 700, marginLeft: 6 }}>/110</span>
                </div>
                <div style={{ ...b(20), color: T.fg2, marginTop: 10 }}>pessoas treinando agora</div>
              </div>
              {[
                [212, 'entradas hoje', T.fg],
                [6, 'bloqueios', T.red],
                ['R$ 16 mil', 'receita recorrente', T.fg],
              ].map(([v, l, c], i) => (
                <div key={l}>
                  <div style={{ ...d(56), color: c }}>{typeof v === 'number' ? <Count to={v} delay={14 + i * 4} /> : v}</div>
                  <div style={{ ...b(17), color: T.fg2 }}>{l}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 5, height: 18 }}>
              {Array.from({ length: 40 }, (_, i) => (
                <i key={i} style={{ flex: 1, borderRadius: 3, background: i < Math.round(17 * grow) ? T.lime : 'rgba(255,255,255,0.08)', display: 'block' }} />
              ))}
            </div>
            <div style={{ ...d(22, 700), color: T.fg2, letterSpacing: '0.06em' }}>Entradas por hora, hoje e média das últimas 4 semanas</div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${hours.length}, 1fr)`, gap: 6, alignItems: 'end', flex: 1, minHeight: 150 }}>
              {hours.map((h, i) => (
                <div key={i} style={{ height: `${(h / max) * 100 * grow}%`, background: i === 12 ? T.lime : i > 12 ? 'rgba(255,255,255,0.06)' : T.fg, borderRadius: '4px 4px 0 0' }} />
              ))}
            </div>
          </div>
        </div>
        <div style={{ flex: 0.9, background: 'rgba(17,17,17,0.85)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 28, padding: 30, display: 'flex', flexDirection: 'column', gap: 14, ...useRise(18, 60) }}>
          <div style={{ ...d(26, 700), letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 12 }}>
            <i style={{ width: 12, height: 12, borderRadius: 6, background: T.green, boxShadow: `0 0 14px ${T.green}`, display: 'block' }} /> Catraca ao vivo
          </div>
          {feed.map(([t, n, m, ok], i) => {
            const s = spring({ frame: frame - 20 - i * 9, fps: FPS, config: { damping: 200 } });
            return (
              <div key={t} style={{ display: 'grid', gridTemplateColumns: '6px 90px 1fr', gap: 16, padding: '16px 18px 16px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', opacity: s, transform: `translateX(${(1 - s) * 30}px)` }}>
                <i style={{ background: ok ? T.green : T.red, borderRadius: '0 3px 3px 0', display: 'block' }} />
                <div style={{ ...d(30, 800) }}>{t}</div>
                <div>
                  <div style={{ ...b(20, 600) }}>{n}</div>
                  <div style={{ ...b(16), color: ok ? T.fg2 : T.red }}>{m}</div>
                </div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </>
  );
}

// ---------------------------------------------------------------- 5. Regras
const RULES = [
  ['Inadimplência', false, 'Vencida em 27/10. Pague no app ou na recepção'],
  ['Horário do plano', false, 'Seu plano libera das 6h às 16h'],
  ['Atestado', false, 'Traga um atestado médico atualizado'],
  ['Antipassback', false, 'Registre a saída antes de entrar de novo'],
  ['Trancamento', false, 'Trancada até 22/11'],
  ['Lotação', false, 'Lotação máxima atingida. Aguarde alguns minutos'],
  ['Aviso de vencimento', true, 'Helena, mensalidade vence em 11/11'],
  ['Saída livre', true, 'Até logo, Mariana'],
];
function S5() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: T.lime, color: '#000', padding: '90px 140px' }}>
      <div style={{ ...d(84), maxWidth: 1300, ...useRise(2) }}>Regras que a recepção não precisa decorar.</div>
      <div style={{ ...b(26), color: '#2a2e10', maxWidth: 1000, marginTop: 18, ...useRise(10) }}>Configure uma vez por plano. A primeira regra que falhar vira a mensagem no display.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, marginTop: 56 }}>
        {RULES.map(([t, ok, msg], i) => {
          const s = spring({ frame: frame - 24 - i * 7, fps: FPS, config: { damping: 18, stiffness: 150 } });
          return (
            <div key={t} style={{ opacity: s, transform: `translateY(${(1 - s) * 40}px) scale(${0.9 + s * 0.1})` }}>
              <div style={{ background: '#000', color: '#e8ecef', borderRadius: 20, padding: '24px 24px 20px', minHeight: 190, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 30px 50px -24px rgba(0,0,0,0.6), inset 0 0 0 1px #262d35' }}>
                <div style={{ ...d(40), color: ok ? T.green : T.red }}>{ok ? 'Liberado' : 'Bloqueado'}</div>
                <div style={{ ...b(20), color: '#c9d0d6', lineHeight: 1.3 }}>{msg}</div>
              </div>
              <div style={{ ...d(30, 800), marginTop: 16 }}>{t}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------- 6. App
function AppScreens({ step }) {
  const t = spring({ frame: useCurrentFrame(), fps: FPS, config: { damping: 200 } });
  const card = { background: '#111', border: '1px solid #222', borderRadius: 14, padding: 16, marginBottom: 12 };
  if (step === 0)
    return (
      <div style={{ padding: '66px 20px 20px' }}>
        <div style={{ ...b(13), color: T.fg2 }}>Academia Contrapeso</div>
        <div style={{ ...d(30), marginBottom: 14 }}>Boa noite, Mariana</div>
        <div style={{ ...card, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 14, alignItems: 'center' }}>
          <span style={{ ...d(92), color: T.lime, lineHeight: 0.8 }}>C</span>
          <div>
            <div style={{ ...b(12), color: T.fg2 }}>Treino de hoje</div>
            <div style={{ ...b(17, 700) }}>Pernas, Panturrilha</div>
            <div style={{ ...b(12), color: T.fg2 }}>6 exercícios, 9/22 séries</div>
          </div>
        </div>
        {[
          ['Agachamento livre', '4 x 8, 60 kg', [1, 1, 1, 0]],
          ['Leg press 45°', '4 x 12, 180 kg', [1, 1, 0, 0]],
          ['Cadeira extensora', '3 x 12-15, 45 kg', [0, 0, 0]],
        ].map(([n, m, sets]) => (
          <div key={n} style={card}>
            <div style={{ ...b(16, 650) }}>{n}</div>
            <div style={{ ...b(13), color: T.fg2 }}>{m}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              {sets.map((s, i) => (
                <span key={i} style={{ width: 54, height: 42, borderRadius: 8, border: `1.5px solid ${s ? T.green : '#2a2a2a'}`, background: s ? T.green : '#1a1a1a', color: s ? '#000' : T.fg, display: 'grid', placeItems: 'center', ...d(18, 800) }}>
                  {s ? '✓' : i + 1}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  if (step === 1)
    return (
      <div style={{ padding: '66px 20px 20px' }}>
        <div style={{ ...b(13), color: T.fg2 }}>Pernas, Barra</div>
        <div style={{ ...d(30) }}>Agachamento livre</div>
        <div style={{ ...b(13), color: T.fg2, marginBottom: 14 }}>Sua ficha: 4 x 8, 60 kg</div>
        <div style={{ position: 'relative', background: '#fff', borderRadius: 16, overflow: 'hidden', aspectRatio: '4/3' }}>
          <Img src={staticFile('exercises/Barbell_Full_Squat/0.jpg')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: 1 - t }} />
          <Img src={staticFile('exercises/Barbell_Full_Squat/1.jpg')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: t }} />
          <span style={{ position: 'absolute', left: 12, bottom: 12, background: '#000', color: T.lime, ...d(14, 700), letterSpacing: '0.06em', padding: '5px 10px', borderRadius: 5 }}>{t > 0.5 ? 'Posição final' : 'Posição inicial'}</span>
        </div>
        <div style={{ ...card, marginTop: 14 }}>
          <div style={{ ...b(14, 650) }}>Passo a passo</div>
          <div style={{ ...b(13), color: T.fg2, marginTop: 6 }}>1. Barra no trapézio, pés na largura dos ombros. 2. Desça empurrando o quadril para trás. 3. Suba com o pé inteiro.</div>
        </div>
      </div>
    );
  if (step === 2)
    return (
      <div style={{ padding: '66px 20px 20px' }}>
        <div style={{ ...b(13), color: T.fg2 }}>Corrida, GPS</div>
        <div style={{ ...d(96), color: T.lime, marginTop: 10 }}>
          4,82 <span style={{ fontSize: 30, color: T.fg }}>km</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 16 }}>
          {[
            ['28:41', 'tempo'],
            ["5'57\"", 'ritmo /km'],
            ['312', 'kcal'],
          ].map(([v, l]) => (
            <div key={l} style={{ ...card, margin: 0, padding: 12 }}>
              <div style={{ ...d(28, 800) }}>{v}</div>
              <div style={{ ...b(12), color: T.fg2 }}>{l}</div>
            </div>
          ))}
        </div>
        <svg viewBox="0 0 260 180" style={{ width: '100%', marginTop: 16, background: '#111', borderRadius: 14 }}>
          <path d="M20 150 C 40 90, 80 70, 110 100 S 170 40, 200 70 S 230 130, 240 40" fill="none" stroke={T.lime} strokeWidth="5" strokeLinecap="round" strokeDasharray="520" strokeDashoffset={520 * (1 - t)} />
          <circle cx="20" cy="150" r="7" fill={T.green} />
        </svg>
        <div style={{ marginTop: 16, background: T.green, color: '#000', borderRadius: 999, padding: '16px 0', textAlign: 'center', ...d(22, 800) }}>Concluir</div>
      </div>
    );
  return (
    <div style={{ padding: '66px 20px 20px' }}>
      <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', aspectRatio: '9/14', background: '#222' }}>
        <Img src={staticFile('exercises/Pullups/1.jpg')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'saturate(0.8) brightness(0.7)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.2), rgba(0,0,0,0.85))' }} />
        <div style={{ position: 'absolute', left: 16, right: 16, bottom: 16 }}>
          <div style={{ ...d(40), color: T.lime }}>Treino C feito</div>
          <div style={{ display: 'flex', gap: 18, marginTop: 8 }}>
            {[
              ['22', 'séries'],
              ['61', 'min'],
              ['14', 'no mês'],
            ].map(([v, l]) => (
              <div key={l}>
                <div style={{ ...d(30, 800) }}>{v}</div>
                <div style={{ ...b(11), color: T.fg2 }}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{ ...b(12), color: T.fg2, marginTop: 10 }}>@academiacontrapeso  @fitmanager.app</div>
        </div>
      </div>
      <div style={{ marginTop: 14, background: T.green, color: '#000', borderRadius: 999, padding: '16px 0', textAlign: 'center', ...d(22, 800) }}>Compartilhar no Instagram</div>
    </div>
  );
}
const APP_TITLES = [
  ['Ficha de treino', 'séries com um toque, descanso cronometrado'],
  ['Guia de execução', 'fotos reais, músculos e passo a passo'],
  ['Cardio com GPS', 'distância, ritmo, calorias e percurso'],
  ['Story para o Instagram', 'a academia marcada em cada post'],
];
function S6({ frames }) {
  const frame = useCurrentFrame();
  const per = frames / 4;
  const step = Math.min(3, Math.floor(frame / per));
  return (
    <>
      <Footage src="video/levantamento.mp4" dark={0.8} from={120} />
      <AbsoluteFill style={{ flexDirection: 'row', alignItems: 'center', padding: '0 160px', gap: 120 }}>
        <div style={{ ...useRise(4, 60), position: 'relative' }}>
          <div style={{ position: 'absolute', width: 560, height: 560, borderRadius: 280, background: T.lime, left: -120, top: 160, opacity: 0.9 }} />
          <Phone style={{ position: 'relative' }}>
            <Sequence from={step * Math.round(per)} layout="none">
              <AppScreens step={step} />
            </Sequence>
          </Phone>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ ...d(84), ...useRise(2) }}>
            O app que o aluno <span style={{ color: T.lime }}>abre todo dia.</span>
          </div>
          <div style={{ marginTop: 40, display: 'grid', gap: 10 }}>
            {APP_TITLES.map(([t, s], i) => (
              <div key={t} style={{ padding: '18px 0', borderTop: '1px solid rgba(255,255,255,0.12)', opacity: i === step ? 1 : 0.4, paddingLeft: i === step ? 18 : 0, borderLeft: i === step ? `4px solid ${T.lime}` : '4px solid transparent', transition: 'none' }}>
                <div style={{ ...d(40, 800) }}>{t}</div>
                <div style={{ ...b(22), color: T.fg2 }}>{s}</div>
              </div>
            ))}
          </div>
        </div>
      </AbsoluteFill>
    </>
  );
}

// ---------------------------------------------------------------- 7. Retenção
const RISK = [
  ['Lucas Ferreira Monteiro', '14 dias sem treinar', 'Anual fidelidade'],
  ['Patrícia Soares Rocha', '12 dias sem treinar', 'Mensal livre'],
  ['Thaís Almeida Correia', 'plano termina em 9 dias', 'Trimestral'],
  ['André Souza Souza', '11 dias sem treinar', 'Anual à vista'],
  ['Letícia Pinto Gomes', 'plano termina em 21 dias', 'Diurno seg a sex'],
];
function S7() {
  const frame = useCurrentFrame();
  return (
    <>
      <Footage src="video/anilhas.mp4" dark={0.8} from={60} />
      <AbsoluteFill style={{ padding: '90px 140px', flexDirection: 'row', gap: 70, alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <div style={{ ...d(96), ...useRise(2) }}>
            Antes de alguém sumir, <span style={{ color: T.lime }}>o sistema avisa.</span>
          </div>
          <div style={{ ...b(28), color: T.fg2, marginTop: 26, maxWidth: 640, ...useRise(12) }}>Quem está sem treinar, quem vence em breve, quem ainda está decidindo. Com o WhatsApp a um toque.</div>
        </div>
        <div style={{ flex: 1.1, background: 'rgba(17,17,17,0.88)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 28, overflow: 'hidden', ...useRise(10, 60) }}>
          <div style={{ padding: '22px 30px', borderBottom: '1px solid rgba(255,255,255,0.1)', ...d(26, 700), letterSpacing: '0.06em' }}>Sumiram da academia</div>
          {RISK.map(([n, s, p], i) => {
            const sp = spring({ frame: frame - 16 - i * 8, fps: FPS, config: { damping: 200 } });
            return (
              <div key={n} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 30px', borderBottom: '1px solid rgba(255,255,255,0.08)', opacity: sp, transform: `translateX(${(1 - sp) * 40}px)` }}>
                <div>
                  <div style={{ ...b(24, 600) }}>{n}</div>
                  <div style={{ ...b(17), color: T.fg2 }}>{p}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                  <span style={{ ...b(19, 600), color: s.includes('sem') ? T.red : T.fg2 }}>{s}</span>
                  <span style={{ ...d(17, 800), letterSpacing: '0.05em', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 999, padding: '8px 16px' }}>Chamar</span>
                </div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </>
  );
}

// ---------------------------------------------------------------- 8. Fechamento
function S8() {
  const frame = useCurrentFrame();
  const s = spring({ frame, fps: FPS, config: { damping: 200, stiffness: 80 } });
  return (
    <>
      <Footage src="video/barra.mp4" dark={0.82} from={30} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22, transform: `scale(${0.9 + s * 0.1})`, opacity: s }}>
          <svg viewBox="0 0 64 64" width="96" height="96">
            <rect width="64" height="64" rx="14" fill="#1B222B" />
            <circle cx="32" cy="32" r="19" fill="none" stroke="#C42A2A" strokeWidth="7" />
            <circle cx="32" cy="32" r="5" fill="#FAFBFC" />
          </svg>
          <div style={{ ...d(120) }}>FitManager</div>
        </div>
        <div style={{ ...d(60), color: T.fg2, ...useRise(14) }}>
          Preço por academia, <span style={{ color: T.lime }}>não por aluno.</span>
        </div>
        <div style={{ marginTop: 20, ...useRise(26) }}>
          <div style={{ display: 'inline-block', background: T.lime, color: '#000', borderRadius: 999, padding: '26px 54px', ...d(38, 800), letterSpacing: '0.04em' }}>Testar 14 dias grátis</div>
        </div>
        <div style={{ ...b(34, 600), color: T.fg, ...useRise(36) }}>fitmanager.com.br</div>
      </AbsoluteFill>
    </>
  );
}

const SCENES = [S1, S2, S3, S4, S5, S6, S7, S8];

export const Video = () => (
  <AbsoluteFill style={{ background: '#000' }}>
    {TRILHA && <Audio src={staticFile('audio/trilha.mp3')} volume={0.16} />}
    {SCENES.map((S, i) => (
      <Sequence key={i} from={START[i]} durationInFrames={SCENE_FRAMES[i] + 14} name={`Cena ${i + 1}`}>
        <Scene frames={SCENE_FRAMES[i] + 14}>
          <S frames={SCENE_FRAMES[i]} />
        </Scene>
        <Audio src={staticFile(`audio/cena-${i + 1}.${durations.ext || 'wav'}`)} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
