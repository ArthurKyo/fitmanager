import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import reels from '../public/audio/reels.json';
import { T, d, b, Display } from './theme.jsx';
import { FPS, Camera, Plane, Blinds, Grain, Vignette, LightLeak, Flash, Typing, Sticker, Bubble, pop, ease, shake, HAND } from './fx.jsx';

/**
 * Reels 9:16. Cada frase da narração é uma cena com câmera em movimento contínuo, objetos em
 * profundidade (telas, celular, fotos) e luz de janela. Grão e vinheta em tudo. Cortes com vazamento de luz.
 */
export { FPS };
const PAD = 0.35;
const FR = reels.durations.map((s) => Math.round((s + PAD) * FPS));
const START = FR.reduce((acc, _, i) => (acc.push(i ? acc[i - 1] + FR[i - 1] : 0), acc), []);
export const REELS_FRAMES = START.at(-1) + FR.at(-1) + 20;

const W = 1080, H = 1920;

/** Mesa de madeira escura com luz de janela (fundo "físico" das cenas de celular). */
function Table({ hue = 28 }) {
  return (
    <AbsoluteFill style={{ background: `linear-gradient(170deg, hsl(${hue} 30% 16%) 0%, hsl(${hue} 28% 9%) 55%, hsl(${hue} 25% 5%) 100%)` }}>
      <AbsoluteFill style={{ background: 'repeating-linear-gradient(92deg, rgba(255,255,255,0.025) 0 3px, rgba(0,0,0,0) 3px 11px)', opacity: 0.7 }} />
      <Blinds angle={-32} opacity={0.6} speed={0.5} />
    </AbsoluteFill>
  );
}

/** Filmagem como pano de fundo desfocado (profundidade de campo). */
function Footage({ src, from = 0, rate = 1.2, blur = 6, dark = 0.6 }) {
  const frame = useCurrentFrame();
  const scale = ease(frame, 0, 150, 1.15, 1.3);
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <OffthreadVideo src={staticFile(src)} muted startFrom={from} playbackRate={rate} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${scale})`, filter: `blur(${blur}px) saturate(0.7) brightness(0.75)` }} />
      <AbsoluteFill style={{ background: `rgba(0,0,0,${dark})` }} />
    </AbsoluteFill>
  );
}

/** Celular físico (não mockup chapado): moldura com brilho de borda, tela com reflexo. */
function Phone3D({ children, w = 440 }) {
  const h = w * 2.05;
  return (
    <div style={{ width: w, height: h, borderRadius: w * 0.14, background: 'linear-gradient(160deg, #3a3a3a, #0a0a0a 40%, #1c1c1c)', padding: 10, boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.18), inset 0 0 0 5px #000', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 22, left: '50%', transform: 'translateX(-50%)', width: w * 0.3, height: 30, borderRadius: 20, background: '#000', zIndex: 3 }} />
      <div style={{ width: '100%', height: '100%', borderRadius: w * 0.12, overflow: 'hidden', background: '#0b0b0b', position: 'relative', color: '#fff', fontFamily: T.body }}>
        {children}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(115deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 35%)', pointerEvents: 'none' }} />
      </div>
    </div>
  );
}

/** Palavra a palavra, com tamanho que varia (pequeno → grande), como na referência. */
function Words({ text, totalFrames, top, color = T.fg, hot = [], sizes = [84, 128], align = 'center', hand = [] }) {
  const frame = useCurrentFrame();
  const words = text.split(' ');
  const per = (totalFrames - 10) / words.length;
  return (
    <div style={{ position: 'absolute', left: 60, right: 60, top, display: 'flex', flexWrap: 'wrap', gap: '0 20px', justifyContent: align, textAlign: align, alignItems: 'baseline' }}>
      {words.map((w, i) => {
        const s = pop(frame, i * per, { damping: 12, stiffness: 240 });
        const key = w.toLowerCase().replace(/[^\wÀ-ÿ]/g, '');
        const isHot = hot.includes(key);
        const isHand = hand.includes(key);
        const size = isHot ? sizes[1] : sizes[0];
        return (
          <span
            key={i}
            style={{
              ...(isHand ? { fontFamily: HAND, fontWeight: 700, fontSize: size * 1.15, textTransform: 'none' } : d(size)),
              color: isHot ? T.lime : color,
              opacity: s,
              display: 'inline-block',
              transform: `translateY(${(1 - s) * 40}px) scale(${interpolate(s, [0, 1], [1.5, 1])}) rotate(${isHand ? -4 : 0}deg)`,
              textShadow: '0 8px 30px rgba(0,0,0,0.7)',
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
}

const Scene = ({ children, frames }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [frames - 5, frames + 2], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ opacity: o, fontFamily: T.body, color: T.fg }}>
      {children}
      <Vignette />
      <Grain />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- 1. Gancho: celular na mesa, notificação da catraca
function R1({ frames }) {
  const f = useCurrentFrame();
  const hit = 20;
  return (
    <>
      <Table />
      <Camera rotX={ease(f, 0, frames, 38, 22)} rotY={ease(f, 0, frames, -14, 6)} dolly={ease(f, 0, frames, 1.25, 1.05)} pan={[0, ease(f, 0, frames, 160, 40)]}>
        <Plane w={440} h={902} z={0} rz={-7} y={120}>
          <Phone3D>
            <div style={{ padding: '120px 24px 0', textAlign: 'center' }}>
              <div style={{ ...d(120), lineHeight: 0.9, opacity: 0.9 }}>18:43</div>
              <div style={{ ...b(18), color: 'rgba(255,255,255,0.6)' }}>Domingo, 8 de novembro</div>
            </div>
            <div style={{ position: 'absolute', left: 16, right: 16, top: 400, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ background: 'rgba(255,255,255,0.92)', color: '#111', borderRadius: 22, padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'flex-start', transform: `scale(${pop(f, hit, { damping: 12, stiffness: 240 })})`, opacity: pop(f, hit) }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: '#1B222B', display: 'grid', placeItems: 'center', flex: 'none' }}>
                  <div style={{ width: 22, height: 22, borderRadius: 11, border: '5px solid #C42A2A' }} />
                </div>
                <div style={{ fontSize: 18, lineHeight: 1.3 }}>
                  <b>FitManager</b> <span style={{ color: '#777', fontSize: 14, marginLeft: 6 }}>agora</span>
                  <div>
                    Rafael Teixeira <b style={{ color: '#c42a2a' }}>entrou</b> na catraca com a mensalidade vencida há 12 dias.
                  </div>
                </div>
              </div>
            </div>
          </Phone3D>
        </Plane>
      </Camera>
      <Words text={reels.text[0]} totalFrames={frames * 0.8} top="9%" hot={['inadimplente']} sizes={[88, 132]} />
      <Flash at={hit} color="#ff4b4b" len={6} max={0.5} />
      <LightLeak at={frames - 10} />
    </>
  );
}

// ---------------------------------------------------------------- 2. A catraca sabe: display em 3D orbitando
function R2({ frames }) {
  const f = useCurrentFrame();
  return (
    <>
      <Footage src="video/barra.mp4" blur={8} dark={0.55} />
      <Blinds angle={-20} opacity={0.35} warm={false} />
      <Camera rotY={ease(f, 0, frames, -32, 8)} rotX={ease(f, 0, frames, 8, -4)} dolly={ease(f, 0, frames, 0.9, 1.08)}>
        <Plane w={940} h={560} z={-200} ry={10} y={-60} bob={6}>
          <div style={{ transform: `scale(${pop(f, 4, { damping: 16, stiffness: 150 })})` }}>
            <Display ok name="Mariana Albuquerque" msg="Bom treino, Mariana!" how="Facial" time="18:42" width={940} scale={1.05} />
          </div>
        </Plane>
        <Plane w={760} h={460} z={260} ry={-18} rx={6} x={120} y={760} bob={9}>
          <div style={{ transform: `scale(${pop(f, 14, { damping: 16, stiffness: 150 })})`, opacity: pop(f, 14) }}>
            <Display ok={false} name="Rafael Teixeira" msg="Vencida em 27/10. Pague no app ou na recepção" how="Digital" time="18:43" width={760} scale={0.85} />
          </div>
        </Plane>
      </Camera>
      <div style={{ position: 'absolute', top: '6%', left: 0, right: 0, textAlign: 'center' }}>
        <Sticker at={2} bg={T.lime} color="#000" rot={-5} size={64}>
          FitManager
        </Sticker>
      </div>
      <Words text="a catraca sabe quem pagou." totalFrames={frames * 0.8} top="56%" hot={['pagou']} sizes={[90, 150]} />
      <Flash at={0} color={T.lime} len={5} max={0.6} />
      <LightLeak at={frames - 10} />
    </>
  );
}

// ---------------------------------------------------------------- 3. Pix: celular inclinado, display digitando o motivo
function R3({ frames }) {
  const f = useCurrentFrame();
  return (
    <>
      <Table hue={22} />
      <Camera rotX={ease(f, 0, frames, 26, 14)} rotY={ease(f, 0, frames, 18, -6)} dolly={ease(f, 0, frames, 1.0, 1.22)} pan={[0, ease(f, 0, frames, 60, -40)]}>
        <Plane w={700} h={300} z={-120} y={-560} rx={-10} rz={3} bob={5}>
          <div style={{ background: '#000', borderRadius: 24, padding: '28px 30px', boxShadow: 'inset 0 0 0 1px #2a2f36', minHeight: 300, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ ...d(64), color: T.red }}>Bloqueado</div>
            <div style={{ ...b(28), color: '#c9d0d6' }}>
              <Typing text="Vencida em 27/10. Pague no app ou na recepção." start={6} cps={26} />
            </div>
            <div style={{ ...b(18), color: 'rgba(255,255,255,0.5)' }}>Catraca 1, entrada</div>
          </div>
        </Plane>
        <Plane w={460} h={943} z={80} rz={6} y={260} x={30}>
          <div style={{ transform: `translateY(${(1 - pop(f, 18, { damping: 16, stiffness: 120 })) * 700}px)` }}>
            <Phone3D w={460}>
              <div style={{ padding: '96px 28px 0' }}>
                <div style={{ ...b(17), color: 'rgba(255,255,255,0.6)' }}>Anual fidelidade, parcela 8 de 12</div>
                <div style={{ ...d(74), marginTop: 6 }}>R$ 109,90</div>
                <div style={{ marginTop: 18, background: '#fff', borderRadius: 18, padding: 16, display: 'flex', justifyContent: 'center' }}>
                  <svg viewBox="0 0 21 21" width="250" height="250" shapeRendering="crispEdges">
                    {Array.from({ length: 441 }, (_, i) => {
                      const x = i % 21, y = Math.floor(i / 21);
                      const fnd = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
                      const on = fnd ? !(x % 6 === 1 || x % 6 === 5 || y % 6 === 1 || y % 6 === 5) && x % 7 !== 6 && y % 7 !== 6 : (x * 7 + y * 13 + x * y) % 3 === 0;
                      return on ? <rect key={i} x={x} y={y} width="1" height="1" fill="#000" /> : null;
                    })}
                  </svg>
                </div>
                <div style={{ marginTop: 18, background: T.lime, color: '#000', borderRadius: 999, padding: '18px 0', textAlign: 'center', ...d(24, 800) }}>Copiar Pix copia e cola</div>
              </div>
            </Phone3D>
          </div>
        </Plane>
      </Camera>
      <Words text="Atrasou? vê o motivo e paga o Pix pelo app." totalFrames={frames * 0.85} top="4%" hot={['pix']} sizes={[72, 120]} hand={['atrasou']} />
      <LightLeak at={frames - 10} />
    </>
  );
}

// ---------------------------------------------------------------- 4. Confirmou, liberou: giro 3D do display
function R4({ frames }) {
  const f = useCurrentFrame();
  const hit = 8;
  const flip = ease(f, hit - 4, hit + 10, 0, 1);
  return (
    <>
      <Footage src="video/levantamento.mp4" from={100} blur={10} dark={0.6} />
      <Blinds angle={-25} opacity={0.3} warm={false} />
      <Camera rotY={ease(f, 0, frames, 10, -10)} dolly={ease(f, 0, frames, 1.15, 1.0)}>
        <Plane w={960} h={600} rx={interpolate(flip, [0, 1], [90, 0])} y={-150} bob={6} style={{ transform: undefined }}>
          <div style={{ transform: `rotateX(${interpolate(flip, [0, 1], [90, 0])}deg)`, transformOrigin: 'center', transform3d: 1 }}>
            <Display ok name="Rafael Teixeira" msg="Pix confirmado. Bom treino, Rafael!" how="QR do app" time="18:46" width={960} scale={1.1} />
          </div>
        </Plane>
      </Camera>
      <AbsoluteFill style={{ transform: shake(f, hit, 26) }}>
        <Words text="Confirmou, liberou." totalFrames={frames * 0.55} top="60%" hot={['liberou']} sizes={[104, 160]} />
        <div style={{ position: 'absolute', top: '77%', left: 0, right: 0, textAlign: 'center' }}>
          <Sticker at={Math.round(frames * 0.5)} bg="#fff" color="#000" rot={5} size={84}>
            na hora.
          </Sticker>
        </div>
      </AbsoluteFill>
      <Flash at={hit} color="#57d08a" len={7} max={0.6} />
      <LightLeak at={frames - 10} />
    </>
  );
}

// ---------------------------------------------------------------- 5. App: polaroids na mesa, depois post no Instagram
function R5({ frames }) {
  const f = useCurrentFrame();
  const half = Math.round(frames * 0.55);
  const photos = ['exercises/Barbell_Full_Squat/0.jpg', 'exercises/Barbell_Full_Squat/1.jpg', 'exercises/Pullups/1.jpg'];
  const likes = Math.round(ease(f, half + 6, half + 40, 0, 3825));
  return (
    <>
      <Table hue={30} />
      {f < half ? (
        <Camera rotX={ease(f, 0, half, 40, 24)} rotY={ease(f, 0, half, -10, 10)} dolly={ease(f, 0, half, 1.3, 1.0)} pan={[0, ease(f, 0, half, 80, 0)]}>
          {photos.map((p, i) => {
            const s = pop(f, 4 + i * 6, { damping: 15, stiffness: 140 });
            return (
              <Plane key={p} w={560} h={640} x={(i - 1) * 220} y={(i - 1) * 60 + 120} z={i * 60} rz={(i - 1) * 9} bob={4}>
                <div style={{ background: '#fff', padding: '18px 18px 80px', borderRadius: 6, transform: `translateY(${(1 - s) * -400}px) rotate(${(1 - s) * 20}deg)`, opacity: s }}>
                  <Img src={staticFile(p)} style={{ width: '100%', height: 480, objectFit: 'cover', display: 'block' }} />
                  <div style={{ fontFamily: HAND, fontSize: 40, color: '#222', marginTop: 12, textAlign: 'center' }}>{['posição inicial', 'posição final', 'story do treino'][i]}</div>
                </div>
              </Plane>
            );
          })}
        </Camera>
      ) : (
        <Camera rotX={ease(f, half, frames, 18, 6)} rotY={ease(f, half, frames, 14, -4)} dolly={ease(f, half, frames, 1.25, 1.02)}>
          <Plane w={720} h={1180} rz={-3} y={80} bob={5}>
            <div style={{ background: '#fff', color: '#111', borderRadius: 26, overflow: 'hidden', fontFamily: T.body, transform: `scale(${pop(f, half, { damping: 15, stiffness: 150 })})` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px' }}>
                <div style={{ width: 44, height: 44, borderRadius: 22, background: 'linear-gradient(135deg,#f58529,#dd2a7b,#8134af)' }} />
                <div style={{ fontWeight: 700, fontSize: 20 }}>
                  mari.reis <span style={{ color: '#1d9bf0' }}>✔</span>
                  <div style={{ fontWeight: 400, fontSize: 15, color: '#666' }}>Academia Contrapeso</div>
                </div>
              </div>
              <div style={{ position: 'relative', height: 780, background: '#000' }}>
                <Img src={staticFile('exercises/Pullups/1.jpg')} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'saturate(0.8) brightness(0.7)' }} />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.1), rgba(0,0,0,0.85))' }} />
                <div style={{ position: 'absolute', left: 30, right: 30, bottom: 30, color: '#fff' }}>
                  <div style={{ ...d(70), color: T.lime }}>Treino C feito</div>
                  <div style={{ display: 'flex', gap: 24, marginTop: 10 }}>
                    {[
                      ['22', 'séries'],
                      ['61', 'min'],
                      ['14', 'no mês'],
                    ].map(([v, l]) => (
                      <div key={l}>
                        <div style={{ ...d(46, 800) }}>{v}</div>
                        <div style={{ ...b(16), color: '#bbb' }}>{l}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ ...b(17), color: '#bbb', marginTop: 10 }}>@academiacontrapeso @fitmanager.app</div>
                </div>
              </div>
              <div style={{ padding: '14px 18px', fontSize: 20 }}>
                <span style={{ color: '#e0245e', fontWeight: 700 }}>♥</span> <b>{likes.toLocaleString('pt-BR')}</b> curtidas
                <div style={{ color: '#444', marginTop: 6, fontSize: 18 }}>
                  <b>mari.reis</b> treino C feito na <b>@academiacontrapeso</b>
                </div>
              </div>
            </div>
          </Plane>
        </Camera>
      )}
      <Words text={reels.text[4]} totalFrames={frames * 0.9} top="5%" hot={['fotos', 'gps', 'story']} sizes={[62, 100]} />
      <Flash at={half} color="#fff" len={5} max={0.7} />
      <LightLeak at={frames - 10} />
    </>
  );
}

// ---------------------------------------------------------------- 6. Painel: WhatsApp da recepção + painel em 3D
function R6({ frames }) {
  const f = useCurrentFrame();
  const n = Math.round(ease(f, 4, 34, 0, 47));
  const grow = ease(f, 6, 38, 0, 1);
  const hours = [2, 5, 9, 14, 12, 7, 4, 3, 5, 8, 11, 16, 19, 15];
  return (
    <>
      <Table hue={20} />
      <Camera rotX={ease(f, 0, frames, 30, 16)} rotY={ease(f, 0, frames, 12, -8)} dolly={ease(f, 0, frames, 1.1, 1.0)} pan={[0, ease(f, 0, frames, 40, -20)]}>
        <Plane w={960} h={760} z={-160} y={-200} rx={-6} bob={4}>
          <div style={{ background: 'rgba(14,14,14,0.96)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 28, padding: 36, transform: `scale(${pop(f, 2, { damping: 16, stiffness: 140 })})` }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 36 }}>
              <div>
                <div style={{ ...d(170), lineHeight: 0.85 }}>
                  {n}
                  <span style={{ fontSize: 48, color: T.fg3, marginLeft: 8 }}>/110</span>
                </div>
                <div style={{ ...b(22), color: T.fg2 }}>treinando agora</div>
              </div>
              <div>
                <div style={{ ...d(64) }}>212</div>
                <div style={{ ...b(18), color: T.fg2 }}>entradas hoje</div>
              </div>
              <div>
                <div style={{ ...d(64), color: T.red }}>6</div>
                <div style={{ ...b(18), color: T.fg2 }}>bloqueios</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${hours.length}, 1fr)`, gap: 8, alignItems: 'end', height: 300, marginTop: 30 }}>
              {hours.map((h, i) => (
                <div key={i} style={{ height: `${(h / 19) * 100 * grow}%`, background: i === 12 ? T.lime : T.fg, borderRadius: '6px 6px 0 0' }} />
              ))}
            </div>
          </div>
        </Plane>
        <Plane w={720} h={420} z={200} x={-60} y={560} rx={8} rz={-4} shadow={false}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontFamily: T.body }}>
            <Bubble at={10} side="left">
              <b>Recepção</b>
              <br />
              Lucas tá há 14 dias sem aparecer 😬
            </Bubble>
            <Bubble at={26} side="right">
              Já chamei no Zap pelo painel. Voltou hoje 💪
            </Bubble>
          </div>
        </Plane>
      </Camera>
      <Words text={reels.text[5]} totalFrames={frames * 0.8} top="4%" hot={['vivo']} sizes={[70, 112]} />
      <LightLeak at={frames - 10} />
    </>
  );
}

// ---------------------------------------------------------------- 7. CTA: lime, cartões flutuando, sticker
function R7({ frames }) {
  const f = useCurrentFrame();
  const s = pop(f, 4, { damping: 14, stiffness: 160 });
  return (
    <>
      <AbsoluteFill style={{ background: T.lime }} />
      <Blinds angle={-30} opacity={0.25} warm={false} />
      <Camera rotX={ease(f, 0, frames, 24, 10)} rotY={ease(f, 0, frames, -18, 12)} dolly={ease(f, 0, frames, 1.2, 1.0)}>
        <Plane w={420} h={861} z={100} x={120} y={640} rz={8} bob={6}>
          <Phone3D w={420}>
            <div style={{ padding: '110px 24px 0' }}>
              <div style={{ ...d(30), color: T.lime }}>Treino A</div>
              <div style={{ ...b(16), color: '#aaa' }}>Peito, Ombros, Tríceps</div>
              {[1, 2, 3].map((i) => (
                <div key={i} style={{ marginTop: 14, background: '#161616', borderRadius: 12, padding: 12 }}>
                  <div style={{ ...b(15, 600) }}>{['Supino reto', 'Supino inclinado', 'Crossover'][i - 1]}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    {[1, 2, 3, 4].map((k) => (
                      <span key={k} style={{ width: 44, height: 34, borderRadius: 6, background: k <= i ? T.green : '#222', color: k <= i ? '#000' : '#fff', display: 'grid', placeItems: 'center', ...d(16, 800) }}>
                        {k <= i ? '✓' : k}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Phone3D>
        </Plane>
      </Camera>
      <div style={{ position: 'absolute', top: '22%', left: 0, right: 0, textAlign: 'center', color: '#000', transform: `scale(${s})`, opacity: s }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 18 }}>
          <svg viewBox="0 0 64 64" width="96" height="96">
            <rect width="64" height="64" rx="14" fill="#000" />
            <circle cx="32" cy="32" r="19" fill="none" stroke="#C42A2A" strokeWidth="7" />
            <circle cx="32" cy="32" r="5" fill={T.lime} />
          </svg>
          <div style={{ ...d(110) }}>FitManager</div>
        </div>
      </div>
      <Words text="Teste grátis 14 dias." totalFrames={frames * 0.55} top="36%" color="#000" hot={[]} sizes={[96, 96]} />
      <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, textAlign: 'center' }}>
        <Sticker at={Math.round(frames * 0.45)} bg="#000" color={T.lime} rot={-4} size={78}>
          link na bio
        </Sticker>
      </div>
      <Flash at={0} color="#000" len={4} max={0.6} />
    </>
  );
}

const SCENES = [R1, R2, R3, R4, R5, R6, R7];

export const Reels = () => (
  <AbsoluteFill style={{ background: '#000' }}>
    {SCENES.map((S, i) => (
      <Sequence key={i} from={START[i]} durationInFrames={FR[i] + 6} name={`Reels ${i + 1}`}>
        <Scene frames={FR[i] + 6}>
          <S frames={FR[i]} />
        </Scene>
        <Audio src={staticFile(`audio/reels-${i + 1}.${reels.ext || 'wav'}`)} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
