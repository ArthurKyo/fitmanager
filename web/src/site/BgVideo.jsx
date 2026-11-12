import { useEffect, useRef, useState } from 'react';
import { reduced } from './motion.jsx';
import { asset } from '../api.js';

/**
 * Vídeo de fundo do site inteiro. Três clipes em capítulos: conforme a página desce,
 * o tempo do vídeo acompanha a rolagem (no desktop) e os clipes trocam com fusão.
 * Em telas de toque, onde o seek por scroll engasga, os clipes tocam em loop e só trocam com o scroll.
 * Arquivos em public/video (Pexels, uso livre). Para usar filmagens da academia, troque os mp4 mantendo os nomes.
 */
const CLIPS = ['/video/barra.mp4', '/video/levantamento.mp4', '/video/anilhas.mp4'].map(asset);

export default function BgVideo() {
  const vids = useRef([]);
  const [idx, setIdx] = useState(0);
  const [ready, setReady] = useState(CLIPS.map(() => false));
  const scrub = !reduced() && !window.matchMedia('(pointer: coarse)').matches;

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      const n = CLIPS.length;
      const i = Math.min(n - 1, Math.floor(p * n));
      setIdx(i);
      if (!scrub) return;
      const v = vids.current[i];
      if (!v || !Number.isFinite(v.duration)) return;
      const local = p * n - i;
      const t = local * (v.duration - 0.05);
      if (Math.abs(v.currentTime - t) > 0.04) v.currentTime = t;
    };
    const onScroll = () => raf || (raf = requestAnimationFrame(update));
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [scrub]);

  // Sem scrub (toque): só o clipe ativo toca, os outros pausam.
  useEffect(() => {
    if (scrub) return;
    vids.current.forEach((v, i) => {
      if (!v) return;
      if (i === idx) v.play().catch(() => {});
      else v.pause();
    });
  }, [idx, scrub]);

  return (
    <div className="bgv" aria-hidden="true">
      {CLIPS.map((src, i) => (
        <video
          key={src}
          ref={(el) => (vids.current[i] = el)}
          className={i === idx && ready[i] ? 'on' : ''}
          src={src}
          muted
          playsInline
          loop={!scrub}
          autoPlay={!scrub && i === 0}
          preload={i === 0 ? 'auto' : 'metadata'}
          onLoadedMetadata={() => setReady((r) => r.map((x, j) => (j === i ? true : x)))}
        />
      ))}
      <div className="bgv-shade" />
    </div>
  );
}
