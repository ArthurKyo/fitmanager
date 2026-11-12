import { useEffect, useRef } from 'react';
import { asset } from '../api.js';
import { reduced } from './motion.jsx';

const IMG = { src: '/img/regras.jpg', w: 1600, h: 900 };
const clamp = (v) => Math.min(1, Math.max(0, v));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

/**
 * Regras da catraca em "foto que se parte": a seção fica presa na tela enquanto a página rola.
 * A foto aparece inteira, se divide em uma grade (4x2 no desktop, 2x4 no celular), os pedaços se
 * afastam e viram em onda diagonal, mostrando no verso a mensagem que o aluno lê no display.
 * Com movimento reduzido, os cards já aparecem virados, sem prender a rolagem.
 */
export default function SplitRules({ rules }) {
  const track = useRef(null);
  const grid = useRef(null);
  const hint = useRef(null);
  const tiles = useRef([]);

  useEffect(() => {
    const still = reduced();
    const narrow = window.matchMedia('(max-width: 720px)');
    let cols = 4;
    let rows = 2;
    let raf = 0;

    function layout() {
      cols = narrow.matches ? 2 : 4;
      rows = Math.ceil(rules.length / cols);
      const g = grid.current;
      g.style.setProperty('--cols', cols);
      g.style.setProperty('--rows', rows);
      // A grade inteira funciona como uma única foto em "cover": cada pedaço mostra a sua parte.
      const W = g.offsetWidth;
      const H = g.offsetHeight;
      const s = Math.max(W / IMG.w, H / IMG.h);
      g.style.setProperty('--iw', `${IMG.w * s}px`);
      g.style.setProperty('--ih', `${IMG.h * s}px`);
      g.style.setProperty('--ox', `${(W - IMG.w * s) / 2}px`);
      g.style.setProperty('--oy', `${(H - IMG.h * s) / 2}px`);
      g.style.setProperty('--tw', `${W / cols}px`);
      g.style.setProperty('--th', `${H / rows}px`);
      tiles.current.forEach((t, i) => {
        if (!t) return;
        const c = i % cols;
        const r = Math.floor(i / cols);
        t.style.setProperty('--c', c);
        t.style.setProperty('--r', r);
        const corner = (cond) => (cond ? '18px' : 'var(--rad)');
        t.style.setProperty('--tl', corner(c === 0 && r === 0));
        t.style.setProperty('--tr', corner(c === cols - 1 && r === 0));
        t.style.setProperty('--br', corner(c === cols - 1 && r === rows - 1));
        t.style.setProperty('--bl', corner(c === 0 && r === rows - 1));
      });
    }

    function apply(p) {
      const g = grid.current;
      const seam = easeOut(clamp(p / 0.14));
      g.style.setProperty('--rad', `${14 * seam}px`);
      g.style.setProperty('--sh', seam.toFixed(3));
      const sepP = easeInOut(clamp((p - 0.04) / 0.28));
      const sep = (cols === 4 ? 22 : 12) * sepP;
      g.style.transform = `scale(${1 - 0.06 * sepP})`;
      const maxOrder = cols + rows - 2;
      tiles.current.forEach((t, i) => {
        if (!t) return;
        const c = i % cols;
        const r = Math.floor(i / cols);
        const x = (c - (cols - 1) / 2) * sep;
        const y = (r - (rows - 1) / 2) * sep;
        const start = 0.3 + ((c + r) / maxOrder) * 0.34;
        const f = easeInOut(clamp((p - start) / 0.2));
        const arc = Math.sin(f * Math.PI);
        const tilt = (c < cols / 2 ? -1 : 1) * 5 * arc;
        t.style.transform = `translate3d(${x}px, ${y}px, ${arc * 70}px) rotateY(${180 * f}deg) rotateZ(${tilt}deg)`;
        t.classList.toggle('flipped', f > 0.5);
      });
      if (hint.current) hint.current.style.opacity = String(1 - clamp(p / 0.08));
    }

    function update() {
      raf = 0;
      if (still) return apply(1);
      const r = track.current.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      apply(total > 0 ? clamp(-r.top / total) : 1);
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    const onResize = () => {
      layout();
      update();
    };

    track.current.classList.toggle('still', still);
    layout();
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    narrow.addEventListener?.('change', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      narrow.removeEventListener?.('change', onResize);
    };
  }, [rules.length]);

  return (
    <div className="split-track" ref={track}>
      <div className="split-stage">
        <div className="split-grid" ref={grid} style={{ '--img': `url(${asset(IMG.src)})` }}>
          {rules.map((r, i) => (
            <div className="split-tile" key={r.t} ref={(el) => (tiles.current[i] = el)}>
              <div className="split-face split-front" aria-hidden="true" />
              <div className="split-face split-back">
                <div className="rs-display">
                  <span className={`rs-status ${r.ok ? 'ok' : 'no'}`}>{r.ok ? 'Liberado' : 'Bloqueado'}</span>
                  <span className="rs-msg">{r.msg}</span>
                </div>
                <h4>{r.t}</h4>
                <p>{r.d}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="split-hint" ref={hint} aria-hidden="true">
          Role para virar as regras <i className="bi bi-arrow-down" />
        </div>
      </div>
    </div>
  );
}
