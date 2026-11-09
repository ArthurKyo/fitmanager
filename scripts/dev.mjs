// Sobe API (3333) e Web (5173) juntos. Ctrl+C encerra os dois.
import { spawn } from 'node:child_process';
const procs = [
  ['api', 'npm', ['run', 'dev', '--prefix', 'api']],
  ['web', 'npm', ['run', 'dev', '--prefix', 'web']],
].map(([name, cmd, args]) => {
  const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  const tag = (s) => s.toString().split('\n').filter(Boolean).forEach((l) => console.log(`[${name}] ${l}`));
  p.stdout.on('data', tag); p.stderr.on('data', tag);
  return p;
});
const stop = () => { procs.forEach((p) => p.kill()); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
