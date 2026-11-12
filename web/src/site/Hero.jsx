import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Arrow, reduced, useGlow } from './motion.jsx';

// Decisões reais do motor de regras, como aparecem no display da catraca.
const PASSES = [
  { ok: false, name: 'Rafael Teixeira', msg: 'Mensalidade vencida em 27/10. Pague no app ou na recepção.', how: 'Digital', t: '18:43' },
  { ok: true, name: 'Mariana Albuquerque', msg: 'Bom treino, Mariana.', how: 'Facial', t: '18:43' },
  { ok: false, name: 'Caio Ramos', msg: 'Seu plano libera das 6h às 16h.', how: 'Digital', t: '18:44' },
  { ok: true, name: 'Letícia Nascimento', msg: 'Pix confirmado agora. Pode entrar.', how: 'QR do app', t: '18:44' },
  { ok: false, name: 'Diego Moura', msg: 'Registre a saída antes de entrar de novo.', how: 'Digital', t: '18:45' },
  { ok: true, name: 'Helena Prado', msg: 'Sua mensalidade vence em 11/11.', how: 'Facial', t: '18:46' },
];
const WORD = { true: 'Liberado', false: 'Bloqueado' };
const GLYPHS = 'ABCDEFGHIJLMNOPRSTUVXZ0123456789';

/** Troca o texto embaralhando as letras da esquerda para a direita, como um display se atualizando. */
function useScramble(text, ms = 520) {
  const [out, setOut] = useState(text);
  useEffect(() => {
    if (reduced()) return setOut(text);
    let raf = 0;
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / ms);
      let s = '';
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        s += ch === ' ' || p >= (i + 1) / text.length ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      setOut(s);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, ms]);
  return out;
}

/** Tamanho de fonte para a palavra mais larga caber na largura do painel (sem pular entre as duas). */
function useFitText(ref, sample) {
  const [size, setSize] = useState(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const probe = document.createElement('span');
    probe.className = 'hd-word hd-probe';
    probe.textContent = sample;
    el.appendChild(probe);
    const fit = () => {
      probe.style.fontSize = '100px';
      const w = probe.getBoundingClientRect().width;
      if (w) setSize(Math.min(260, Math.floor((el.clientWidth / w) * 100)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    document.fonts?.ready.then(fit);
    return () => {
      ro.disconnect();
      probe.remove();
    };
  }, [ref, sample]);
  return size;
}

export default function Hero() {
  const ref = useRef(null);
  const wordBox = useRef(null);
  useGlow(ref);
  const [i, setI] = useState(0);
  const [scan, setScan] = useState(false);
  const timer = useRef(0);
  const p = PASSES[i];
  const word = useScramble(WORD[p.ok].toUpperCase());
  const name = useScramble(p.name, 380);
  const size = useFitText(wordBox, 'BLOQUEADO');

  const schedule = () => {
    clearTimeout(timer.current);
    if (reduced()) return;
    timer.current = setTimeout(() => setI((x) => (x + 1) % PASSES.length), 3400);
  };
  useEffect(() => {
    schedule();
    return () => clearTimeout(timer.current);
  }, [i]);

  const pass = () => {
    if (scan) return;
    clearTimeout(timer.current);
    setScan(true);
    setTimeout(() => {
      setScan(false);
      setI((x) => (x + 1) % PASSES.length);
    }, 650);
  };

  return (
    <section className={`hd ${p.ok ? 'is-ok' : 'is-no'}`} ref={ref}>
      <div className="hero-glow" />
      <div className="hd-aura" aria-hidden="true" />
      <div className="wrap hd-inner">
        <div className="hd-screen">
          <div className="hd-top" aria-hidden="true">
            <span>Catraca 1, entrada</span>
            <span>
              {p.how}, {p.t}
            </span>
          </div>
          <div className="hd-word-box" ref={wordBox} aria-hidden="true">
            <span className="hd-word" style={size ? { fontSize: size } : undefined}>
              {word}
            </span>
          </div>
          <div className="hd-bottom">
            <div className="hd-who" aria-hidden="true">
              <b>{name}</b>
              <span key={i}>{p.msg}</span>
            </div>
            <button type="button" className={`hd-sensor ${scan ? 'scan' : ''}`} onClick={pass} aria-label="Passar a digital no leitor da catraca de demonstração">
              <i className="bi bi-fingerprint" />
              <small>Passe o dedo</small>
            </button>
          </div>
        </div>

        <div className="hd-copy">
          <h1 className="d">A catraca sabe quem pagou.</h1>
          <p>
            Quem está em dia entra com a digital ou o rosto. Quem atrasou vê o motivo no display e paga o Pix pelo app, e a catraca libera sozinha. O dono acompanha tudo de um painel só.
          </p>
          <div className="hd-ctas">
            <Link to="/cadastro" className="b lime-b">
              Testar 14 dias grátis <Arrow />
            </Link>
            <a href="#demo" className="b">
              Ver funcionando <Arrow />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
