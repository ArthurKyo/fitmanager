import { useEffect, useState } from 'react';
import { BrandMark } from '../ui/kit.jsx';
import { reduced } from './motion.jsx';

const KEY = 'fm.intro';
const HOLD = 2700; // tempo na tela antes de subir
const EXIT = 750;

/** Deve mostrar? Uma vez por visita, nunca para quem chega por um link de seção (#precos) ou pede menos movimento. */
function shouldShow() {
  try {
    if (new URLSearchParams(location.search).has('intro')) return true;
    if (sessionStorage.getItem(KEY) || location.hash || reduced() || navigator.webdriver) return false;
  } catch {
    return false;
  }
  return true;
}

/**
 * Abertura do site: a marca, uma frase para o dono de academia e a tela sobe revelando o hero.
 * Clique, toque ou qualquer tecla pula.
 */
export default function Intro() {
  const [stage, setStage] = useState(() => (shouldShow() ? 'in' : 'done'));

  useEffect(() => {
    if (stage !== 'in') return undefined;
    try {
      sessionStorage.setItem(KEY, '1');
    } catch {
      /* sem storage: mostra de novo na próxima visita */
    }
    document.documentElement.classList.add('fz-intro-lock');
    const t = setTimeout(() => setStage('out'), HOLD);
    const skip = () => setStage('out');
    window.addEventListener('keydown', skip);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', skip);
    };
  }, [stage]);

  useEffect(() => {
    if (stage !== 'out') return undefined;
    document.documentElement.classList.remove('fz-intro-lock');
    const t = setTimeout(() => setStage('done'), EXIT);
    return () => clearTimeout(t);
  }, [stage]);

  useEffect(() => () => document.documentElement.classList.remove('fz-intro-lock'), []);

  if (stage === 'done') return null;
  return (
    <div className={`intro ${stage === 'out' ? 'out' : ''}`} onClick={() => setStage('out')} role="presentation">
      <div className="intro-inner">
        <div className="intro-brand">
          <span className="intro-mark">
            <BrandMark size={84} />
          </span>
          <b>FitManager</b>
        </div>
        <p className="intro-line d">
          <span className="ln" style={{ '--i': 0 }}>
            <span>Tem aluno treinando</span>
          </span>
          <span className="ln" style={{ '--i': 1 }}>
            <span>de graça na sua academia.</span>
          </span>
        </p>
      </div>
      <div className="intro-bar" style={{ '--hold': `${HOLD}ms` }} />
      <button type="button" className="intro-skip" onClick={() => setStage('out')}>
        Pular
      </button>
    </div>
  );
}
