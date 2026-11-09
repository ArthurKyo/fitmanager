import { useEffect, useRef, useState } from 'react';

export const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Marca .in quando o elemento entra na tela. Um observer só para a página inteira. */
let io;
const seen = new WeakSet();
function observe(el) {
  if (!el || seen.has(el)) return;
  seen.add(el);
  if (reduced()) return el.classList.add('in');
  io ||= new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      }),
    { threshold: 0.18, rootMargin: '0px 0px -8% 0px' }
  );
  io.observe(el);
}
/** <Rv as="div" d={1} className="…">: revela ao entrar na tela, com atraso em passos de 90 ms. */
export function Rv({ as: Tag = 'div', d = 0, x = false, line = false, className = '', children, ...rest }) {
  return (
    <Tag ref={observe} className={`${x ? 'rv-x' : 'rv'} ${line ? 'rv-line' : ''} ${className}`} style={{ '--d': d }} {...rest}>
      {children}
    </Tag>
  );
}

/** Número que conta até o valor quando aparece. */
export function Count({ to, prefix = '', suffix = '', decimals = 0, duration = 1600 }) {
  const ref = useRef();
  const [v, setV] = useState(reduced() ? to : 0);
  useEffect(() => {
    if (reduced()) return setV(to);
    const el = ref.current;
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      const t0 = performance.now();
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / duration);
        const ease = 1 - Math.pow(1 - p, 3);
        setV(to * ease);
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [to, duration]);
  return (
    <span ref={ref}>
      {prefix}
      {v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}

export function Ribbon({ items, dark }) {
  const list = [...items, ...items];
  return (
    <div className={`ribbon ${dark ? 'dark' : ''}`} aria-hidden="true">
      <div className="track">
        {list.map((t, i) => (
          <span key={i}>{t}</span>
        ))}
      </div>
    </div>
  );
}

/** Texto girando em círculo, com um símbolo no centro. */
export function Badge({ text, onLime, children }) {
  return (
    <div className={`badge-wrap ${onLime ? 'on-lime' : ''}`} aria-hidden="true">
      <svg className="badge" viewBox="0 0 112 112">
        <defs>
          <path id="circ" d="M56,56 m-42,0 a42,42 0 1,1 84,0 a42,42 0 1,1 -84,0" />
        </defs>
        <text>
          <textPath href="#circ">{text}</textPath>
        </text>
      </svg>
      <div className="core">{children}</div>
    </div>
  );
}

/** Brilho que segue o mouse no hero. */
export function useGlow(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced() || !window.matchMedia('(hover: hover)').matches) return;
    const move = (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
      el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
    };
    el.addEventListener('mousemove', move);
    return () => el.removeEventListener('mousemove', move);
  }, [ref]);
}

export const Arrow = () => <i className="bi bi-arrow-up-right ar" aria-hidden="true" />;
