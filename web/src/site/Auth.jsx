import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { post, setSession } from '../api.js';
import { BrandMark, useForm } from '../ui/kit.jsx';

const DEMO = [
  ['Dono', 'dono@contrapeso.com.br'],
  ['Recepção', 'recepcao@contrapeso.com.br'],
  ['Professor', 'professor@contrapeso.com.br'],
  ['Aluno (app)', 'aluno@contrapeso.com.br'],
];

export function Login() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [v, setV, bind] = useForm({ email: '', password: '' });
  const [err, setErr] = useState(params.get('expirou') ? 'Sua sessão expirou. Entre novamente.' : '');
  const [busy, setBusy] = useState(false);
  const demo = params.get('demo');
  useEffect(() => {
    const email = DEMO.find(([r, e]) => e.startsWith(`${demo}@`))?.[1];
    if (email) submit(null, { email, password: 'fitmanager123' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo]);

  async function submit(e, override) {
    e?.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const s = await post('/auth/login', override || v);
      setSession(s);
      nav(params.get('next') || (s.user.role === 'aluno' ? '/app' : '/painel'), { replace: true });
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="panel auth-card stack-lg">
        <Link to="/" className="brand" style={{ color: 'var(--ink)', padding: 0 }}>
          <BrandMark />
          <b>FitManager</b>
        </Link>
        <div>
          <h1 style={{ fontSize: 24 }}>{params.get('app') ? 'Entrar no app do aluno' : 'Entrar'}</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            {params.get('app') ? 'Use o e-mail cadastrado na recepção.' : 'Painel da academia e app do aluno usam o mesmo login.'}
          </p>
        </div>
        <form className="stack" onSubmit={submit}>
          <label className="field">
            <span>E-mail</span>
            <input className="input" type="email" autoComplete="username" required {...bind('email')} />
          </label>
          <label className="field">
            <span>Senha</span>
            <input className="input" type="password" autoComplete="current-password" required {...bind('password')} />
          </label>
          {err && <div className="alert red">{err}</div>}
          <button className="btn primary lg" disabled={busy}>
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
        <div className="stack">
          <p className="small muted">Academia de demonstração (senha fitmanager123):</p>
          <div className="demo-logins">
            {DEMO.map(([r, e]) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  setV({ email: e, password: 'fitmanager123' });
                  submit(null, { email: e, password: 'fitmanager123' });
                }}
              >
                <b>{r}</b>
                <span className="muted">{e}</span>
              </button>
            ))}
          </div>
        </div>
        <p className="small muted">
          Ainda não usa o FitManager? <Link to="/cadastro">Cadastre sua academia</Link>
        </p>
      </div>
    </div>
  );
}

export function Signup() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [v, , bind] = useForm({ gym_name: '', owner_name: '', email: '', password: '', phone: '', cnpj: '', city: '', pix_key: '', saas_plan: params.get('plano') || 'performance' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const s = await post('/public/signup', v);
      setSession(s);
      nav('/painel/configuracoes?bemvindo=1', { replace: true });
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="panel auth-card stack" style={{ width: 'min(560px, 100%)' }} onSubmit={submit}>
        <Link to="/" className="brand" style={{ color: 'var(--ink)', padding: 0, marginBottom: 8 }}>
          <BrandMark />
          <b>FitManager</b>
        </Link>
        <h1 style={{ fontSize: 24 }}>Cadastre sua academia</h1>
        <p className="muted">14 dias grátis. Você sai daqui com dois planos de exemplo e um simulador de catraca para testar.</p>
        <label className="field">
          <span>Nome da academia</span>
          <input className="input" required {...bind('gym_name')} />
        </label>
        <div className="grid-2">
          <label className="field">
            <span>Seu nome</span>
            <input className="input" required {...bind('owner_name')} />
          </label>
          <label className="field">
            <span>WhatsApp</span>
            <input className="input" inputMode="tel" {...bind('phone')} />
          </label>
        </div>
        <div className="grid-2">
          <label className="field">
            <span>E-mail</span>
            <input className="input" type="email" required {...bind('email')} />
          </label>
          <label className="field">
            <span>Senha</span>
            <input className="input" type="password" minLength={8} required {...bind('password')} />
            <small>Mínimo de 8 caracteres</small>
          </label>
        </div>
        <div className="grid-2">
          <label className="field">
            <span>CNPJ</span>
            <input className="input" inputMode="numeric" {...bind('cnpj')} />
          </label>
          <label className="field">
            <span>Cidade</span>
            <input className="input" {...bind('city')} />
          </label>
        </div>
        <label className="field">
          <span>Chave Pix para receber mensalidades</span>
          <input className="input" {...bind('pix_key')} placeholder="CNPJ, e-mail, telefone ou chave aleatória" />
          <small>Pode deixar para depois, em Configurações.</small>
        </label>
        <label className="field">
          <span>Plano do FitManager</span>
          <select className="select" {...bind('saas_plan')}>
            <option value="essencial">Essencial, R$ 189/mês</option>
            <option value="performance">Performance, R$ 349/mês</option>
            <option value="rede">Rede, sob consulta</option>
          </select>
        </label>
        {err && <div className="alert red">{err}</div>}
        <button className="btn primary lg" disabled={busy}>
          {busy ? 'Criando a conta…' : 'Criar conta e entrar'}
        </button>
        <p className="small muted">
          Já tem conta? <Link to="/entrar">Entrar</Link>
        </p>
      </form>
    </div>
  );
}
