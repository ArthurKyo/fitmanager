import { loadFont as loadBarlow } from '@remotion/google-fonts/BarlowCondensed';
import { loadFont as loadArchivo } from '@remotion/google-fonts/Archivo';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

const barlow = loadBarlow('normal', { weights: ['700', '800', '900'], subsets: ['latin', 'latin-ext'] });
const archivo = loadArchivo('normal', { weights: ['400', '500', '600', '700'], subsets: ['latin', 'latin-ext'] });

export const T = {
  k: '#060606',
  k2: '#111111',
  lime: '#d2f531',
  fg: '#ffffff',
  fg2: '#b8b8b0',
  fg3: '#767670',
  green: '#57d08a',
  red: '#ff6b6b',
  display: barlow.fontFamily,
  body: archivo.fontFamily,
};

export const d = (size, weight = 900) => ({ fontFamily: T.display, fontWeight: weight, textTransform: 'uppercase', fontSize: size, lineHeight: 0.92, letterSpacing: '0.005em' });
export const b = (size, weight = 500) => ({ fontFamily: T.body, fontWeight: weight, fontSize: size, lineHeight: 1.5 });

/** Entrada com mola: translateY + opacidade. delay em frames. */
export function useRise(delay = 0, distance = 40) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200, stiffness: 120, mass: 0.9 } });
  return { opacity: interpolate(s, [0, 1], [0, 1]), transform: `translateY(${interpolate(s, [0, 1], [distance, 0])}px)` };
}

/** Linha de título que sobe de dentro de uma máscara. */
export function Line({ children, delay = 0, style }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200, stiffness: 90 } });
  return (
    <div style={{ overflow: 'hidden', display: 'block' }}>
      <div style={{ transform: `translateY(${interpolate(s, [0, 1], [110, 0])}%)`, ...style }}>{children}</div>
    </div>
  );
}

/** Esmaece nas bordas da cena (entrada e saída). */
export function useFade(durationInFrames, edge = 12) {
  const frame = useCurrentFrame();
  return interpolate(frame, [0, edge, durationInFrames - edge, durationInFrames], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
}

export const Glass = ({ children, style }) => (
  <div
    style={{
      background: 'linear-gradient(135deg, rgba(255,255,255,0.14), rgba(255,255,255,0.04) 45%, rgba(255,255,255,0.09))',
      border: '1px solid rgba(255,255,255,0.22)',
      boxShadow: '0 60px 120px -30px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.45)',
      borderRadius: 36,
      padding: 28,
      backdropFilter: 'blur(26px) saturate(1.5)',
      WebkitBackdropFilter: 'blur(26px) saturate(1.5)',
      ...style,
    }}
  >
    {children}
  </div>
);

/** Display da catraca. */
export function Display({ ok, name, msg, how, time, width = 760, scale = 1 }) {
  return (
    <Glass style={{ width }}>
      <div style={{ background: 'rgba(0,0,0,0.5)', borderRadius: 22, padding: 34, minHeight: 300 * scale, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)' }}>
        <div>
          <div style={{ ...d(72 * scale), color: ok ? T.green : T.red }}>{ok ? 'Liberado' : 'Bloqueado'}</div>
          <div style={{ ...b(30 * scale, 650), color: T.fg, marginTop: 14 }}>{name}</div>
          <div style={{ ...b(22 * scale), color: 'rgba(255,255,255,0.72)', marginTop: 4 }}>{msg}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', ...b(18 * scale), color: 'rgba(255,255,255,0.55)', borderTop: '1px solid rgba(255,255,255,0.14)', paddingTop: 16, marginTop: 24 }}>
          <span>Catraca 1, entrada</span>
          <span>
            {how}, {time}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 22, padding: '0 8px' }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <i style={{ width: 16, height: 16, borderRadius: 8, background: ok ? T.green : 'rgba(255,255,255,0.12)', boxShadow: ok ? `0 0 18px ${T.green}` : 'none', display: 'block' }} />
          <i style={{ width: 16, height: 16, borderRadius: 8, background: ok ? 'rgba(255,255,255,0.12)' : T.red, boxShadow: ok ? 'none' : `0 0 18px ${T.red}`, display: 'block' }} />
        </div>
        <div style={{ width: 100, height: 66, borderRadius: 14, background: 'radial-gradient(circle at 50% 35%, rgba(255,255,255,0.22), rgba(255,255,255,0.05))', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.2)' }} />
      </div>
    </Glass>
  );
}

/** Moldura de celular (390x800) com conteúdo. */
export function Phone({ children, style }) {
  return (
    <div style={{ width: 390, height: 800, borderRadius: 56, background: '#000', padding: 14, boxShadow: '0 60px 110px -30px rgba(0,0,0,0.95), inset 0 0 0 2px #2b2b2b', position: 'relative', ...style }}>
      <div style={{ position: 'absolute', top: 24, left: '50%', transform: 'translateX(-50%)', width: 120, height: 32, borderRadius: 20, background: '#000', zIndex: 2 }} />
      <div style={{ width: '100%', height: '100%', borderRadius: 44, overflow: 'hidden', background: T.k, color: T.fg, position: 'relative', fontFamily: T.body }}>{children}</div>
    </div>
  );
}

export const Tag = ({ children, color = T.lime, bg = 'rgba(210,245,49,0.14)' }) => (
  <span style={{ ...d(16, 700), letterSpacing: '0.06em', color, background: bg, borderLeft: `3px solid ${color}`, padding: '4px 10px', borderRadius: 4, display: 'inline-block' }}>{children}</span>
);
