// Carrossel de planos com lente de vidro líquido, em WebGL puro (sem bibliotecas).
// Passo 1: os cards (desenhados num canvas 2D e enviados como textura) são renderizados numa textura.
// Passo 2: um shader de tela cheia lê essa textura e, dentro de uma elipse no centro, refrata a imagem
// na borda, separa as cores (dispersão) e desenha o anel de luz. Fora da lente, a imagem passa intacta.

const LIME = '#D2F531';

const VS_CARD = `
attribute vec2 aPos;
uniform vec2 uRes;
uniform vec4 uRect;
varying vec2 vUv;
void main() {
  vUv = aPos;
  vec2 px = uRect.xy + aPos * uRect.zw;
  vec2 clip = px / uRes * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const FS_CARD = `
precision mediump float;
uniform sampler2D uTex;
uniform float uAlpha;
uniform float uDim;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uTex, vUv);
  c.rgb *= uDim;
  gl_FragColor = c * uAlpha;
}`;

const VS_FULL = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FS_LENS = `
precision highp float;
uniform sampler2D uScene;
uniform vec2 uRes;
uniform vec2 uCenter;
uniform vec2 uRadii;
uniform float uRot;
uniform float uTime;
uniform float uFx;
uniform float uDpr;
uniform float uShimmer;
uniform float uRimStart;

vec4 scene(vec2 px) { return texture2D(uScene, clamp(px / uRes, vec2(0.0), vec2(1.0))); }

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec4 base = scene(frag);
  if (uFx <= 0.001) { gl_FragColor = base; return; }

  vec2 p = frag - uCenter;
  float cs = cos(uRot);
  float sn = sin(uRot);
  vec2 lp = vec2(cs * p.x + sn * p.y, -sn * p.x + cs * p.y);
  vec2 q = lp / uRadii;
  float r = length(q);
  if (r > 1.3) { gl_FragColor = base; return; }

  float a = atan(q.y, q.x);
  float m = smoothstep(uRimStart, 1.0, r) * uFx;

  // Refração: a borda empurra a imagem ao longo da tangente com uma onda irregular, como vidro derretido.
  float wave = sin(a * 2.0) * 0.55 + sin(a) * 0.25 + sin(a * 3.0 + uTime * 0.7) * 0.12;
  vec2 tang = vec2(-sin(a), cos(a));
  vec2 rad = vec2(cos(a), sin(a));
  vec2 offL = (tang * wave * 0.07 - rad * m * 0.07) * uRadii * m;
  vec2 off = vec2(cs * offL.x - sn * offL.y, sn * offL.x + cs * offL.y);
  vec2 dirL = rad * uRadii;
  vec2 dir = normalize(vec2(cs * dirL.x - sn * dirL.y, sn * dirL.x + cs * dirL.y));

  // Dispersão: vermelho e azul saem para lados opostos perto da borda.
  float d = m * m * 7.0 * uDpr;
  vec2 sp = frag + off;
  vec4 cR = scene(sp + dir * d);
  vec4 cG = scene(sp);
  vec4 cB = scene(sp - dir * d);
  vec4 col = vec4(cR.r, cG.g, cB.b, max(cG.a, max(cR.a, cB.a)));
  col.rgb *= 1.0 - 0.18 * m * m;

  // Corpo do vidro: véu leve e reflexo no canto superior esquerdo.
  float fill = 0.035 * uFx;
  vec2 h = q - vec2(-0.38, 0.52);
  float hl = exp(-dot(h, h) / 0.06) * 0.2 * uFx;
  vec4 lensCol = vec4(col.rgb + vec3(fill + hl), min(1.0, col.a + fill + hl));

  float aa = 1.5 / min(uRadii.x, uRadii.y);
  float inside = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r);
  vec4 outc = mix(base, lensCol, inside);

  // Anel lime com brilho que corre pela borda, mais um fio branco por dentro.
  float shimmer = 1.0 + uShimmer * 0.18 * sin(a * 12.0 + uTime * 3.5);
  float ring = exp(-pow((r - 0.985) / 0.016, 2.0));
  float aura = exp(-pow((r - 1.0) / 0.07, 2.0));
  vec3 lime = vec3(0.824, 0.961, 0.192);
  vec3 glow = mix(lime, vec3(1.0), 0.25) * (ring * 0.85 + aura * 0.3) * shimmer * uFx;
  glow += vec3(exp(-pow((r - 0.955) / 0.0045, 2.0)) * 0.55 * uFx);
  outc.rgb += glow;
  outc.a = min(1.0, outc.a + max(glow.r, max(glow.g, glow.b)));
  gl_FragColor = outc;
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const { name } = gl.getActiveUniform(p, i);
    u[name] = gl.getUniformLocation(p, name);
  }
  return { p, u, aPos: gl.getAttribLocation(p, 'aPos') };
}

// ---------- Desenho do card (canvas 2D, nas fontes do site) ----------
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function wrap(g, text, max) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const t = line ? `${line} ${word}` : word;
    if (g.measureText(t).width > max && line) {
      lines.push(line);
      line = word;
    } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

export function drawPlanCard(plan, w, h, dpr) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const k = w / 340;
  const hot = !!plan.hot;
  const ink = hot ? '#060606' : '#ffffff';
  const soft = hot ? 'rgba(6,6,6,0.66)' : 'rgba(255,255,255,0.62)';
  const pad = 30 * k;

  roundRect(g, 0.5, 0.5, w - 1, h - 1, 22 * k);
  if (hot) {
    g.fillStyle = LIME;
    g.fill();
  } else {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#171717');
    grad.addColorStop(1, '#0c0c0c');
    g.fillStyle = grad;
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 1;
    g.stroke();
  }

  g.textBaseline = 'alphabetic';
  g.fillStyle = ink;
  g.font = `800 ${30 * k}px "Barlow Condensed", sans-serif`;
  g.fillText(plan.name.toUpperCase(), pad, pad + 26 * k);

  let y = pad + 26 * k + 22 * k;
  if (plan.price) {
    g.font = `900 ${76 * k}px "Barlow Condensed", sans-serif`;
    y += 66 * k;
    g.fillText(plan.price, pad, y);
    const pw = g.measureText(plan.price).width;
    g.fillStyle = soft;
    g.font = `700 ${20 * k}px "Barlow Condensed", sans-serif`;
    g.fillText(plan.unit || '', pad + pw + 6 * k, y);
  } else {
    g.font = `900 ${46 * k}px "Barlow Condensed", sans-serif`;
    y += 44 * k;
    g.fillText(plan.priceText, pad, y);
  }

  y += 22 * k;
  g.fillStyle = hot ? 'rgba(6,6,6,0.18)' : 'rgba(255,255,255,0.1)';
  g.fillRect(pad, y, w - pad * 2, 1);
  y += 26 * k;

  g.font = `500 ${15.5 * k}px Archivo, sans-serif`;
  const lh = 21 * k;
  for (const item of plan.items) {
    const lines = wrap(g, item, w - pad * 2 - 26 * k);
    // ícone de check
    g.strokeStyle = hot ? '#060606' : LIME;
    g.lineWidth = 2 * k;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(pad + 1 * k, y - 5 * k);
    g.lineTo(pad + 5.5 * k, y - 0.5 * k);
    g.lineTo(pad + 13 * k, y - 10 * k);
    g.stroke();
    g.fillStyle = ink;
    lines.forEach((l, i) => g.fillText(l, pad + 26 * k, y + i * lh));
    y += lines.length * lh + 10 * k;
  }

  // botão
  const bh = 48 * k;
  const by = h - pad - bh;
  roundRect(g, pad, by, w - pad * 2, bh, bh / 2);
  if (hot) {
    g.fillStyle = '#060606';
    g.fill();
  } else {
    g.strokeStyle = 'rgba(255,255,255,0.32)';
    g.lineWidth = 1.5;
    g.stroke();
  }
  g.fillStyle = hot ? LIME : '#ffffff';
  g.font = `800 ${17 * k}px "Barlow Condensed", sans-serif`;
  if ('letterSpacing' in g) g.letterSpacing = `${0.6 * k}px`;
  const label = plan.cta.toUpperCase();
  const lw = g.measureText(label).width;
  const tx = w / 2 - (lw + 18 * k) / 2;
  g.fillText(label, tx, by + bh / 2 + 6 * k);
  // seta
  g.strokeStyle = hot ? LIME : '#ffffff';
  g.lineWidth = 2 * k;
  const ax = tx + lw + 8 * k;
  const ay = by + bh / 2;
  g.beginPath();
  g.moveTo(ax, ay + 5 * k);
  g.lineTo(ax + 10 * k, ay - 5 * k);
  g.moveTo(ax + 3 * k, ay - 5 * k);
  g.lineTo(ax + 10 * k, ay - 5 * k);
  g.lineTo(ax + 10 * k, ay + 2 * k);
  g.stroke();
  return c;
}

// ---------- Motor ----------
const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const easeInOut = (t) => {
  t = Math.min(1, Math.max(0, t));
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
const mod = (a, n) => ((a % n) + n) % n;

/**
 * Monta o carrossel no canvas. Devolve null quando não há WebGL (o componente mostra a grade comum).
 * opts: { start, reduced, onActive(i), onOpen(i) }
 */
export function createGlassCarousel(canvas, plans, opts = {}) {
  const gl =
    canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true }) ||
    canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true });
  if (!gl) return null;

  let cardProg;
  let lensProg;
  try {
    cardProg = program(gl, VS_CARD, FS_CARD);
    lensProg = program(gl, VS_FULL, FS_LENS);
  } catch (e) {
    console.warn('[planos] WebGL indisponível:', e);
    return null;
  }

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
  const tri = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, tri);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  const n = plans.length;
  const reduced = !!opts.reduced;
  let W = 0;
  let H = 0;
  let dpr = 1;
  let cardW = 0;
  let cardH = 0;
  let slot = 0;
  let centerY = 0;
  let lensRx = 0;
  let lensRy = 0;
  let textures = [];
  let fbo = null;
  let fboTex = null;

  // posição em "cards": 1.0 = um card para a direita
  let pos = opts.start || 0;
  let target = pos;
  let prevPos = pos;
  let energy = 0;
  let active = -1;
  let lastInput = 0;
  let dragging = false;
  let introStart = reduced ? -1e9 : null; // começa quando o carrossel aparece
  let raf = 0;
  let visible = false;
  let destroyed = false;
  const t0 = performance.now();

  function texFrom(source) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  function buildCards() {
    textures.forEach((t) => gl.deleteTexture(t));
    textures = plans.map((p) => texFrom(drawPlanCard(p, cardW, cardH, dpr)));
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    cardH = Math.round(Math.min(470, H - 200));
    cardW = Math.round(cardH * 0.74);
    if (cardW > W * 0.72) {
      cardW = Math.round(W * 0.72);
      cardH = Math.round(cardW / 0.74);
    }
    slot = cardW + Math.round(Math.max(16, cardW * 0.07));
    lensRx = Math.min(cardW * 0.76, W * 0.48);
    lensRy = cardH * 0.62;
    centerY = lensRy + 18;

    if (fboTex) gl.deleteTexture(fboTex);
    if (fbo) gl.deleteFramebuffer(fbo);
    fboTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, fboTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    buildCards();
  }

  // ---------- entrada ----------
  const snapTo = (p) => Math.round(p);
  function go(delta) {
    target = snapTo(target) + delta;
    lastInput = performance.now();
  }

  function cardAt(x, y) {
    const k = Math.round(pos + (x - W / 2) / slot);
    const cx = W / 2 + (k - pos) * slot;
    if (Math.abs(x - cx) < cardW / 2 && Math.abs(y - centerY) < cardH / 2) return k;
    return null;
  }

  let down = null;
  const samples = [];
  function onDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    down = { x: e.clientX, y: e.clientY, pos, moved: 0, type: e.pointerType, id: e.pointerId };
    samples.length = 0;
    samples.push({ t: performance.now(), x: e.clientX });
  }
  function onMove(e) {
    const r = canvas.getBoundingClientRect();
    const hit = cardAt(e.clientX - r.left, e.clientY - r.top);
    canvas.style.cursor = dragging ? 'grabbing' : hit !== null ? 'pointer' : 'grab';
    if (!down || e.pointerId !== down.id) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    if (!dragging) {
      const limit = down.type === 'touch' ? 10 : 5;
      if (Math.abs(dx) < limit) return;
      if (down.type === 'touch' && Math.abs(dy) > Math.abs(dx)) {
        down = null; // gesto vertical: é rolagem da página
        return;
      }
      dragging = true;
      canvas.setPointerCapture?.(e.pointerId);
    }
    down.moved = Math.max(down.moved, Math.abs(dx));
    const sens = down.type === 'touch' ? 1 : 1.3;
    target = down.pos - (dx * sens) / slot;
    samples.push({ t: performance.now(), x: e.clientX });
    if (samples.length > 6) samples.shift();
    lastInput = performance.now();
  }
  function onUp(e) {
    if (!down || e.pointerId !== down.id) return;
    const wasDrag = dragging;
    dragging = false;
    if (wasDrag) {
      const now = performance.now();
      const a = samples[0];
      const b = samples[samples.length - 1];
      let v = 0;
      if (b && a && now - b.t < 90 && b.t > a.t) v = (b.x - a.x) / (b.t - a.t); // px/ms
      target = snapTo(target - (v * 260) / slot);
    } else {
      const r = canvas.getBoundingClientRect();
      const k = cardAt(e.clientX - r.left, e.clientY - r.top);
      if (k !== null) {
        if (k === Math.round(pos) && Math.abs(target - pos) < 0.2) opts.onOpen?.(mod(k, n));
        else target = k;
      }
    }
    down = null;
    lastInput = performance.now();
  }
  function onWheel(e) {
    // Só o gesto horizontal mexe no carrossel; a rolagem vertical continua sendo da página.
    const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
    if (!dx) return;
    e.preventDefault();
    target += (dx * 1.2) / slot;
    lastInput = performance.now();
    wheelIdle = true;
  }
  let wheelIdle = false;

  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  // ---------- quadro ----------
  function drawCard(tex, x, y, w, h, alpha, dim) {
    gl.uniform4f(cardProg.u.uRect, (x - w / 2) * dpr, (y - h / 2) * dpr, w * dpr, h * dpr);
    gl.uniform1f(cardProg.u.uAlpha, alpha);
    gl.uniform1f(cardProg.u.uDim, dim);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  let last = performance.now();
  function frame(now) {
    raf = 0;
    if (destroyed) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const f = (k) => 1 - Math.pow(1 - k, dt * 60);

    if (wheelIdle && now - lastInput > 120) {
      target = snapTo(target);
      wheelIdle = false;
    }
    pos += (target - pos) * (dragging ? f(0.35) : f(reduced ? 0.3 : 0.1));
    if (Math.abs(target - pos) < 0.0005) pos = target;
    const speed = Math.abs(pos - prevPos) * slot / Math.max(dt * 60, 0.001);
    prevPos = pos;
    energy += (Math.min(1, speed / 45) - energy) * f(0.12);

    const idx = mod(Math.round(pos), n);
    if (idx !== active) {
      active = idx;
      opts.onActive?.(idx);
    }

    if (introStart === null) introStart = now;
    const it = (now - introStart) / 1000;

    // passo 1: cards na textura
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(cardProg.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(cardProg.aPos);
    gl.vertexAttribPointer(cardProg.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(cardProg.u.uRes, canvas.width, canvas.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(cardProg.u.uTex, 0);
    const first = Math.floor(pos - (W / 2 + cardW) / slot);
    const lastK = Math.ceil(pos + (W / 2 + cardW) / slot);
    const shrink = 1 - 0.16 * energy;
    for (let k = first; k <= lastK; k++) {
      const rel = k - pos;
      const dist = Math.min(1, Math.abs(rel));
      const s = shrink * (1 - 0.08 * dist);
      const rank = Math.abs(Math.round(rel));
      const e = reduced ? 1 : ease((it - 0.15 - rank * 0.09) / 0.9);
      const y = centerY + (1 - e) * H * 0.75;
      drawCard(textures[mod(k, n)], W / 2 + rel * slot, y, cardW * s, cardH * s, e, 1 - 0.32 * dist);
    }

    // passo 2: lente
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.BLEND);
    gl.useProgram(lensProg.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, tri);
    gl.enableVertexAttribArray(lensProg.aPos);
    gl.vertexAttribPointer(lensProg.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, fboTex);
    gl.uniform1i(lensProg.u.uScene, 0);
    const time = (now - t0) / 1000;
    const fx = reduced ? 1 : easeInOut((it - 0.55) / 1.2);
    const bloom = 0.82 + 0.18 * fx;
    gl.uniform2f(lensProg.u.uRes, canvas.width, canvas.height);
    gl.uniform2f(lensProg.u.uCenter, (W / 2) * dpr, (H - centerY) * dpr);
    gl.uniform2f(lensProg.u.uRadii, lensRx * bloom * (1 + 0.1 * energy) * dpr, lensRy * bloom * (1 - 0.06 * energy) * dpr);
    gl.uniform1f(lensProg.u.uRot, -0.12 + (reduced ? 0 : 0.04 * Math.sin(time * 0.4)));
    gl.uniform1f(lensProg.u.uTime, reduced ? 0 : time);
    gl.uniform1f(lensProg.u.uFx, fx);
    gl.uniform1f(lensProg.u.uDpr, dpr);
    gl.uniform1f(lensProg.u.uShimmer, reduced ? 0 : 1);
    gl.uniform1f(lensProg.u.uRimStart, lensRx < cardW * 0.72 ? 0.82 : 0.72);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (visible && !document.hidden) raf = requestAnimationFrame(frame);
  }
  const kick = () => {
    if (!raf && visible && !document.hidden && !destroyed) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };

  const io = new IntersectionObserver(([en]) => {
    visible = en.isIntersecting;
    kick();
  });
  io.observe(canvas);
  const onVis = () => kick();
  document.addEventListener('visibilitychange', onVis);
  const ro = new ResizeObserver(() => {
    resize();
    kick();
  });
  ro.observe(canvas);
  resize();

  // As fontes do site chegam depois do primeiro desenho: redesenha os cards quando estiverem prontas.
  if (document.fonts) {
    Promise.all(
      ['900 40px "Barlow Condensed"', '800 40px "Barlow Condensed"', '700 20px "Barlow Condensed"', '500 16px Archivo'].map((f) => document.fonts.load(f))
    )
      .then(() => !destroyed && buildCards())
      .catch(() => {});
  }

  return {
    next: () => (go(1), kick()),
    previous: () => (go(-1), kick()),
    goTo(i) {
      const cur = Math.round(target);
      const d = mod(i - mod(cur, n) + Math.floor(n / 2), n) - Math.floor(n / 2);
      target = cur + d;
      kick();
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      textures.forEach((t) => gl.deleteTexture(t));
      if (fboTex) gl.deleteTexture(fboTex);
      if (fbo) gl.deleteFramebuffer(fbo);
    },
  };
}
