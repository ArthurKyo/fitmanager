import { useEffect, useRef, useState } from 'react';
import { get, post } from '../api.js';
import { Icon, useToast } from '../ui/kit.jsx';

const W = 1080, H = 1920; // story
const LIME = '#d2f531';

const disp = (size, weight = 900) => `${weight} ${size}px "Barlow Condensed", "Archivo", sans-serif`;
const body = (size, weight = 500) => `${weight} ${size}px "Archivo", system-ui, sans-serif`;

/** Desenha a imagem cobrindo a área (como object-fit: cover). */
function cover(g, img, x, y, w, h) {
  const r = Math.max(w / img.width, h / img.height);
  const iw = img.width * r, ih = img.height * r;
  g.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}

function drawRoute(g, route, x, y, w, h, color, width) {
  if (!route || route.length < 2) return;
  const lats = route.map((p) => p[0]), lons = route.map((p) => p[1]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const bw = (maxLon - minLon) * kx || 1e-6, bh = maxLat - minLat || 1e-6;
  const s = Math.min(w / bw, h / bh) * 0.92;
  const ox = x + (w - bw * s) / 2, oy = y + (h - bh * s) / 2;
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.shadowColor = 'rgba(0,0,0,0.6)';
  g.shadowBlur = 12;
  g.beginPath();
  route.forEach(([la, lo], i) => {
    const px = ox + (lo - minLon) * kx * s, py = oy + bh * s - (la - minLat) * s;
    i ? g.lineTo(px, py) : g.moveTo(px, py);
  });
  g.stroke();
  g.shadowBlur = 0;
}

/**
 * Modelo "foto": a foto do aluno ocupa o story inteiro, com os números por cima, no pé, como no Strava.
 * Modelo "escuro": fundo preto com faixa lime diagonal, para quem não quer foto.
 */
async function draw(canvas, { template, photo, title, stats, route, c }) {
  await document.fonts.ready;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, W, H);
  const gymTag = c.gym.instagram ? `@${c.gym.instagram}` : c.gym.name;
  const date = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');

  if (template === 'foto' && photo) {
    cover(g, photo, 0, 0, W, H);
    // escurece o pé para o texto ler
    const grad = g.createLinearGradient(0, H * 0.45, 0, H);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0.55)');
    grad.addColorStop(1, 'rgba(0,0,0,0.92)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    const top = g.createLinearGradient(0, 0, 0, 360);
    top.addColorStop(0, 'rgba(0,0,0,0.6)');
    top.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = top;
    g.fillRect(0, 0, W, 360);
  } else {
    g.fillStyle = '#060606';
    g.fillRect(0, 0, W, H);
    // faixa lime diagonal
    g.save();
    g.translate(0, H * 0.52);
    g.rotate(-0.14);
    g.fillStyle = LIME;
    g.fillRect(-200, -70, W + 600, 140);
    g.restore();
    const rg = g.createRadialGradient(W * 0.8, H * 0.15, 10, W * 0.8, H * 0.15, 800);
    rg.addColorStop(0, 'rgba(210,245,49,0.3)');
    rg.addColorStop(1, 'rgba(210,245,49,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, W, H);
  }

  // cabeçalho: academia e data
  g.fillStyle = '#ffffff';
  g.font = disp(44, 700);
  g.fillText(c.gym.name.toUpperCase(), 80, 150);
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.font = body(34);
  g.fillText(`${c.member.name.split(' ')[0]}  ·  ${date}`.replace('  ·  ', '    '), 80, 205);

  // percurso (direita, meio)
  if (route && route.length > 1) drawRoute(g, route, W - 80 - 420, template === 'foto' ? 980 : 760, 420, 380, template === 'foto' ? '#ffffff' : LIME, 12);

  // título
  const titleY = template === 'foto' ? 1420 : 1160;
  g.fillStyle = LIME;
  g.font = disp(128);
  const words = title.toUpperCase().split(' ');
  const rows = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (g.measureText(t).width > W - 160 && cur) {
      rows.push(cur);
      cur = w;
    } else cur = t;
  }
  rows.push(cur);
  rows.slice(-2).forEach((r, i) => g.fillText(r, 80, titleY - (rows.slice(-2).length - 1 - i) * 118));

  // números em linha, estilo Strava
  const baseY = titleY + 80;
  const colW = (W - 160) / Math.min(stats.length, 4);
  stats.slice(0, 4).forEach(([v, l], i) => {
    const x = 80 + i * colW;
    g.fillStyle = '#ffffff';
    g.font = disp(stats.length > 3 ? 96 : 120);
    g.fillText(String(v), x, baseY + 100);
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.font = body(30, 600);
    g.fillText(l.toUpperCase(), x, baseY + 150);
  });

  // rodapé: marcações e marca
  g.fillStyle = LIME;
  g.font = disp(52, 800);
  g.fillText('FITMANAGER', W - 80 - g.measureText('FITMANAGER').width, H - 230);
  g.fillRect(80, H - 190, W - 160, 4);
  g.fillStyle = '#ffffff';
  g.font = body(38, 600);
  g.fillText(gymTag, 80, H - 110);
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.fillText(`@${c.app_handle}`, W - 80 - g.measureText(`@${c.app_handle}`).width, H - 110);
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => (URL.revokeObjectURL(url), resolve(img));
    img.onerror = reject;
    img.src = url;
  });
}

export default function ShareCard({ kind = 'treino', refId, title, stats, route, onClose }) {
  const toast = useToast();
  const canvasRef = useRef();
  const fileRef = useRef();
  const [c, setC] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [template, setTemplate] = useState('foto');
  const [blob, setBlob] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    get('/me/share-context').then(setC);
    document.body.style.overflow = 'hidden';
    return () => (document.body.style.overflow = '');
  }, []);
  useEffect(() => {
    if (!c) return;
    const cv = canvasRef.current;
    cv.width = W;
    cv.height = H;
    setReady(false);
    draw(cv, { template: photo ? template : 'escuro', photo, title, stats, route, c }).then(() => cv.toBlob((b) => (setBlob(b), setReady(true)), 'image/jpeg', 0.92));
  }, [c, photo, template, title, stats, route]);

  async function pick(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      setPhoto(await loadImage(f));
      setTemplate('foto');
    } catch {
      toast('Não consegui abrir essa imagem', 'err');
    }
  }

  const caption = c
    ? `${title} na ${c.gym.instagram ? `@${c.gym.instagram}` : c.gym.name}. ${stats.map(([v, l]) => `${v} ${l}`).join(', ')}. Registrado no @${c.app_handle} #fitmanager #${(c.gym.instagram || c.gym.name).replace(/\W/g, '').toLowerCase()}`
    : '';
  const record = () => post('/me/shares', { kind, ref_id: refId }).catch(() => {});

  async function share() {
    const file = new File([blob], 'fitmanager-story.jpg', { type: 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: caption });
        record();
        toast('Compartilhado. Marque a academia no story!');
      } catch (e) {
        if (e.name !== 'AbortError') toast('Não deu para abrir o compartilhamento. Baixe a imagem.', 'err');
      }
    } else {
      download();
      toast('Imagem salva. Abra o Instagram e poste nos stories.');
    }
  }
  function download() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fitmanager-${kind}.jpg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    record();
  }

  return (
    <div className="scrim sheet-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Compartilhar">
        <div className="sheet-grip" />
        <div className="sheet-body stack">
          <div className="spread">
            <div>
              <h3>Postar no Instagram</h3>
              <p className="small muted">Sua foto com os números por cima, pronta para o story.</p>
            </div>
            <button className="btn ghost sm" onClick={onClose} aria-label="Fechar">
              <Icon name="x" />
            </button>
          </div>

          <div className="share-grid">
            <canvas ref={canvasRef} className="story-preview" aria-label="Prévia do story" />
            <div className="stack">
              <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
              <button className="btn primary" onClick={() => fileRef.current.click()}>
                <i className="bi bi-camera" aria-hidden="true" /> {photo ? 'Trocar foto' : 'Tirar ou escolher foto'}
              </button>
              {photo && (
                <div className="div-pick" role="group" aria-label="Modelo">
                  <button aria-pressed={template === 'foto'} onClick={() => setTemplate('foto')} style={{ width: 'auto', padding: '0 12px' }}>
                    Foto
                  </button>
                  <button aria-pressed={template === 'escuro'} onClick={() => setTemplate('escuro')} style={{ width: 'auto', padding: '0 12px' }}>
                    Escuro
                  </button>
                </div>
              )}
              {!photo && <p className="tiny muted">Sem foto, sai o modelo escuro com faixa lime.</p>}
              {c && <p className="tiny muted">{c.shares_month > 0 ? `Você já postou ${c.shares_month} vez(es) este mês.` : 'Primeira postagem do mês.'}</p>}
            </div>
          </div>

          <button className="btn go lg" style={{ width: '100%' }} disabled={!ready} onClick={share}>
            <i className="bi bi-instagram" aria-hidden="true" /> {ready ? 'Compartilhar' : 'Montando a arte…'}
          </button>
          <div className="row">
            <button className="btn grow" disabled={!ready} onClick={download}>
              <i className="bi bi-download" aria-hidden="true" /> Baixar
            </button>
            <button className="btn grow" disabled={!c} onClick={() => navigator.clipboard?.writeText(caption).then(() => toast('Legenda copiada'), () => toast('Não deu para copiar', 'err'))}>
              <Icon name="copy" /> Legenda
            </button>
          </div>
          {caption && <div className="pix-code" style={{ fontFamily: 'inherit', fontSize: 13 }}>{caption}</div>}
        </div>
      </div>
    </div>
  );
}
