import { AbsoluteFill, interpolate, spring, useCurrentFrame } from 'remotion';
import { loadFont as loadCaveat } from '@remotion/google-fonts/Caveat';

const caveat = loadCaveat('normal', { weights: ['700'], subsets: ['latin', 'latin-ext'] });
export const HAND = caveat.fontFamily;

export const FPS = 30;
export const rnd = (f, seed = 1) => ((Math.sin(f * 12.9898 * seed + 78.233) * 43758.5453) % 1 + 1) % 1 - 0.5;

/** Mola curta para entradas com peso. */
export const pop = (frame, at, cfg = {}) => spring({ frame: frame - at, fps: FPS, config: { damping: 14, stiffness: 180, mass: 0.9, ...cfg } });
export const ease = (frame, from, to, a, b) => interpolate(frame, [from, to], [a, b], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

/** Tremor de câmera que decai. */
export const shake = (frame, at, power = 18, len = 14) => {
  const t = frame - at;
  if (t < 0 || t > len) return 'translate(0,0)';
  const k = power * (1 - t / len);
  return `translate(${rnd(t, 1) * k}px, ${rnd(t, 2) * k}px)`;
};

/**
 * Câmera 3D: tudo dentro ganha perspectiva. rotX/rotY em graus, dolly em escala, pan em px.
 * Cada cena define a trajetória com interpolate; o resultado é o movimento contínuo da referência.
 */
export function Camera({ rotX = 0, rotY = 0, rotZ = 0, dolly = 1, pan = [0, 0], children, style }) {
  return (
    <AbsoluteFill style={{ perspective: 1500, perspectiveOrigin: '50% 45%', ...style }}>
      <AbsoluteFill style={{ transformStyle: 'preserve-3d', transform: `translate(${pan[0]}px, ${pan[1]}px) scale(${dolly}) rotateX(${rotX}deg) rotateY(${rotY}deg) rotateZ(${rotZ}deg)` }}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
}

/** Painel flutuando no espaço 3D: posição, profundidade (z), inclinação própria e balanço lento. */
export function Plane({ x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, w, h, bob = 0, children, style, shadow = true }) {
  const frame = useCurrentFrame();
  const b = bob ? Math.sin(frame / 22) * bob : 0;
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: w,
        height: h,
        marginLeft: -w / 2,
        marginTop: -h / 2,
        transform: `translate3d(${x}px, ${y + b}px, ${z}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)`,
        transformStyle: 'preserve-3d',
        boxShadow: shadow ? '0 60px 90px -30px rgba(0,0,0,0.8), 0 20px 30px -20px rgba(0,0,0,0.6)' : 'none',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Luz de persiana atravessando a cena, deslizando devagar. */
export function Blinds({ angle = -28, opacity = 0.5, speed = 0.6, warm = true }) {
  const frame = useCurrentFrame();
  const shift = frame * speed;
  const c = warm ? '255,214,160' : '210,245,49';
  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        mixBlendMode: 'screen',
        opacity,
        background: `repeating-linear-gradient(${angle}deg, rgba(${c},0) 0px, rgba(${c},0) 140px, rgba(${c},0.55) 150px, rgba(${c},0.55) 260px, rgba(${c},0) 270px, rgba(${c},0) 420px)`,
        backgroundPosition: `${shift}px 0`,
        filter: 'blur(14px)',
        transform: 'scale(1.3)',
      }}
    />
  );
}

/** Grão de filme: ruído que muda a cada quadro. */
export function Grain({ opacity = 0.14 }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', mixBlendMode: 'overlay', opacity }}>
      <svg width="100%" height="100%">
        <filter id={`g${frame % 7}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={frame % 1000} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#g${frame % 7})`} />
      </svg>
    </AbsoluteFill>
  );
}

export const Vignette = ({ strength = 0.75 }) => (
  <AbsoluteFill style={{ pointerEvents: 'none', background: `radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 45%, rgba(0,0,0,${strength}) 100%)` }} />
);

/** Vazamento de luz quente que cruza a tela num corte. */
export function LightLeak({ at, len = 14, color = '255,170,80' }) {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < -2 || t > len) return null;
  const p = Math.max(0, Math.min(1, t / len));
  const o = Math.sin(p * Math.PI) * 0.9;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', mixBlendMode: 'screen', opacity: o, background: `radial-gradient(60% 40% at ${20 + p * 60}% ${30 + p * 20}%, rgba(${color},0.9), rgba(${color},0) 70%)` }} />
  );
}

export const Flash = ({ at, color = '#fff', len = 5, max = 0.9 }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [at, at + 1, at + len], [0, max, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ background: color, opacity: o, pointerEvents: 'none' }} />;
};

/** Texto digitando com cursor. cps = caracteres por segundo. */
export function Typing({ text, start = 0, cps = 22, cursor = true, style }) {
  const frame = useCurrentFrame();
  const n = Math.max(0, Math.floor(((frame - start) / FPS) * cps));
  const done = n >= text.length;
  const blink = Math.floor(frame / 8) % 2 === 0;
  return (
    <span style={style}>
      {text.slice(0, n)}
      {cursor && (!done || blink) && <span style={{ opacity: done && !blink ? 0 : 1 }}>|</span>}
    </span>
  );
}

/** Adesivo manuscrito, torto, que entra com soco. */
export function Sticker({ children, at = 0, color = '#fff', bg = '#000', rot = -6, size = 54, style }) {
  const frame = useCurrentFrame();
  const s = pop(frame, at, { damping: 10, stiffness: 260 });
  return (
    <div
      style={{
        display: 'inline-block',
        fontFamily: HAND,
        fontWeight: 700,
        fontSize: size,
        color,
        background: bg,
        padding: '6px 22px 10px',
        borderRadius: 14,
        transform: `rotate(${rot}deg) scale(${interpolate(s, [0, 1], [2.2, 1])})`,
        opacity: s,
        boxShadow: '0 20px 40px -16px rgba(0,0,0,0.6)',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Balão de mensagem (estilo WhatsApp). */
export function Bubble({ children, at = 0, side = 'left', style }) {
  const frame = useCurrentFrame();
  const s = pop(frame, at, { damping: 13, stiffness: 220 });
  const left = side === 'left';
  return (
    <div
      style={{
        alignSelf: left ? 'flex-start' : 'flex-end',
        maxWidth: '82%',
        background: left ? '#ffffff' : '#d9fdd3',
        color: '#111',
        padding: '14px 18px',
        borderRadius: left ? '4px 18px 18px 18px' : '18px 4px 18px 18px',
        fontSize: 26,
        lineHeight: 1.35,
        boxShadow: '0 6px 14px rgba(0,0,0,0.25)',
        transform: `scale(${interpolate(s, [0, 1], [0.6, 1])}) translateY(${(1 - s) * 20}px)`,
        transformOrigin: left ? 'left bottom' : 'right bottom',
        opacity: s,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
