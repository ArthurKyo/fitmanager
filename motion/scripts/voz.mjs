/**
 * Gera a narração com voz de alta qualidade (ElevenLabs) e atualiza as durações.
 *
 *   ELEVENLABS_API_KEY=sua_chave node scripts/voz.mjs            # vídeo longo + reels
 *   ELEVENLABS_API_KEY=sua_chave node scripts/voz.mjs reels      # só o reels
 *   ELEVENLABS_API_KEY=sua_chave ELEVEN_VOICE=<voice_id> node scripts/voz.mjs
 *
 * Voz padrão: a voz multilíngue mais usada para vendas em pt-BR na biblioteca da ElevenLabs
 * ("Brian" não serve, é en-US). Escolha em https://elevenlabs.io/app/voice-library filtrando
 * Portuguese (Brazil) > Narrative/Advertisement e copie o Voice ID.
 * Sem chave, o projeto continua com a voz-guia do macOS.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const audioDir = path.join(here, '..', 'public', 'audio');
// lê motion/.env (ELEVENLABS_API_KEY=..., ELEVEN_VOICE=...) sem depender de pacote
const envFile = path.join(here, '..', '.env');
if (fs.existsSync(envFile))
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
const KEY = process.env.ELEVENLABS_API_KEY;
// Vozes por nome (resolvidas em "Minhas Vozes" da conta) ou por ID. Longo: Fabio Oliveira (grave, corporativo). Reels: Fabi (energia, feita para reels).
const VOICE_LONG = process.env.ELEVEN_VOICE || 'Fabio Oliveira';
const VOICE_REELS = process.env.ELEVEN_VOICE_REELS || process.env.ELEVEN_VOICE || 'Fabi';
if (!KEY) {
  console.error('Defina ELEVENLABS_API_KEY. Plano Starter (US$ 5/mês) cobre as duas narrações com folga.');
  process.exit(1);
}

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

let voicesCache;
async function resolveVoice(nameOrId) {
  if (/^[A-Za-z0-9]{20,}$/.test(nameOrId)) return nameOrId;
  if (!voicesCache) {
    const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': KEY } });
    if (!r.ok) throw new Error(`Não consegui listar as vozes (${r.status}). A chave precisa de permissão "Vozes: Ler", ou use ELEVEN_VOICE com o ID.`);
    voicesCache = (await r.json()).voices;
  }
  const v = voicesCache.find((x) => x.name.toLowerCase().startsWith(nameOrId.toLowerCase()));
  if (!v) throw new Error(`Voz "${nameOrId}" não está em Minhas Vozes. Disponíveis: ${voicesCache.map((x) => x.name).join(', ')}`);
  return v.voice_id;
}

async function tts(text, file, style) {
  const voiceId = await resolveVoice(style === 'reels' ? VOICE_REELS : VOICE_LONG);
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: style === 'reels' ? 0.35 : 0.5, similarity_boost: 0.8, style: style === 'reels' ? 0.55 : 0.3, use_speaker_boost: true },
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

function duration(file) {
  const out = execFileSync('afinfo', [file], { encoding: 'utf8' });
  return Number(out.split('\n').find((l) => l.includes('estimated duration')).split(':')[1].trim().split(' ')[0]);
}

const only = process.argv[2];
const jobs = [];
if (!only || only === 'longo') jobs.push({ texts: LONG, prefix: 'cena', json: 'durations.json', style: 'longo' });
if (!only || only === 'reels') jobs.push({ texts: REELS, prefix: 'reels', json: 'reels.json', style: 'reels' });

for (const j of jobs) {
  const durs = [];
  for (let i = 0; i < j.texts.length; i++) {
    const file = path.join(audioDir, `${j.prefix}-${i + 1}.mp3`);
    process.stdout.write(`${j.prefix}-${i + 1}… `);
    await tts(j.texts[i], file, j.style);
    const wav = path.join(audioDir, `${j.prefix}-${i + 1}.wav`);
    if (fs.existsSync(wav)) fs.unlinkSync(wav); // a composição procura .wav primeiro; removendo, usa o .mp3
    durs.push(Math.round(duration(file) * 100) / 100);
    console.log(`${durs.at(-1)} s`);
  }
  const p = path.join(audioDir, j.json);
  const prev = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
  fs.writeFileSync(p, JSON.stringify({ ...prev, durations: durs, ext: 'mp3' }, null, 2));
}
console.log('\nPronto. Rode npm run render e npm run render:reels.');
