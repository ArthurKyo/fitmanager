/**
 * Puxa do histórico da conta ElevenLabs os áudios gerados pela interface (plano gratuito não
 * permite vozes da biblioteca pela API, mas permite gerar no site). Casa cada item pelo texto
 * com as cenas do vídeo longo e do Reels, salva em public/audio e atualiza as durações.
 *
 *   node scripts/historico.mjs          # usa ELEVENLABS_API_KEY de motion/.env (precisa de "Histórico: Ler")
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const audioDir = path.join(here, '..', 'public', 'audio');
const envFile = path.join(here, '..', '.env');
if (fs.existsSync(envFile))
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) throw new Error('ELEVENLABS_API_KEY ausente');
const H = { 'xi-api-key': KEY };

const LONG = [
  'Toda academia conhece a cena. O aluno atrasado passa pela catraca, a recepção não sabe quem pagou, e a conta fecha no fim do mês, na raça.',
  'O FitManager liga a catraca ao financeiro. Quem está em dia entra com a digital ou com o rosto. Quem atrasou vê o motivo no display, sem constrangimento no balcão.',
  'E resolve na hora. O aluno paga o Pix pelo app, a confirmação chega sozinha e a catraca libera. Sem comprovante, sem fila.',
  'Para o dono, um painel só. Quantas pessoas estão treinando agora, o pico de cada dia da semana, a receita do mês, quem cobrar primeiro, e o motivo de cada bloqueio.',
  'As regras você configura uma vez por plano. Tolerância de atraso, horário, atestado, trancamento, fidelidade. O sistema aplica em cada passagem, em cada cobrança, em cada cancelamento.',
  'O aluno ganha um app que dá vontade de abrir. Ficha de treino com fotos reais de cada exercício, cronômetro de descanso, cardio com GPS, e um story pronto para o Instagram marcando a sua academia.',
  'E antes de alguém sumir, o sistema avisa. Quem está há dez dias sem treinar, quem vence em trinta, quem ainda está decidindo. Cada um com o WhatsApp a um toque.',
  'FitManager. Preço por academia, não por aluno. Teste grátis por catorze dias em fitmanager ponto com ponto be erre.',
];
const REELS = JSON.parse(fs.readFileSync(path.join(audioDir, 'reels.json'), 'utf8')).text;
const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, ' ').trim();

const res = await fetch('https://api.elevenlabs.io/v1/history?page_size=200', { headers: H });
if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
const items = (await res.json()).history;
console.log(`${items.length} itens no histórico`);

function duration(file) {
  const out = execFileSync('afinfo', [file], { encoding: 'utf8' });
  return Number(out.split('\n').find((l) => l.includes('estimated duration')).split(':')[1].trim().split(' ')[0]);
}

async function pull(texts, prefix, json) {
  const durs = [];
  for (let i = 0; i < texts.length; i++) {
    // o mais recente com esse texto (a interface gera duas tomadas; a primeira listada é a última gerada)
    const textOf = (h) => h.text || (h.dialogue || []).map((d) => d.text).join(' ');
    const cands = items.filter((h) => norm(textOf(h)) === norm(texts[i]));
    const it = cands.find((h) => h.model_id === 'eleven_v4') || cands[0]; // tomada principal, não a experimental
    if (!it) {
      console.log(`${prefix}-${i + 1}: ainda não gerado no site`);
      durs.push(null);
      continue;
    }
    const a = await fetch(`https://api.elevenlabs.io/v1/history/${it.history_item_id}/audio`, { headers: H });
    if (!a.ok) throw new Error(`${a.status} ${await a.text()}`);
    const file = path.join(audioDir, `${prefix}-${i + 1}.mp3`);
    fs.writeFileSync(file, Buffer.from(await a.arrayBuffer()));
    const wav = path.join(audioDir, `${prefix}-${i + 1}.wav`);
    if (fs.existsSync(wav)) fs.unlinkSync(wav);
    durs.push(Math.round(duration(file) * 100) / 100);
    console.log(`${prefix}-${i + 1}: ${it.voice_name}, ${durs.at(-1)} s`);
  }
  if (durs.every((d) => d != null)) {
    const p = path.join(audioDir, json);
    const prev = JSON.parse(fs.readFileSync(p, 'utf8'));
    fs.writeFileSync(p, JSON.stringify({ ...prev, durations: durs, ext: 'mp3' }, null, 2));
    console.log(`${json} atualizado`);
  }
}

const only = process.argv[2];
if (!only || only === 'longo') await pull(LONG, 'cena', 'durations.json');
if (!only || only === 'reels') await pull(REELS, 'reels', 'reels.json');
