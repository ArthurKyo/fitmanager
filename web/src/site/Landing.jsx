import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import './site.css';
import { BrandMark } from '../ui/kit.jsx';
import { Rv, Arrow, useGlow, reduced } from './motion.jsx';
import BgVideo from './BgVideo.jsx';

// Decisões reais do motor de regras, como aparecem no display da catraca.
const PASSES = [
  { ok: true, name: 'Mariana Albuquerque', msg: 'Bom treino, Mariana!', how: 'Facial', t: '18:42' },
  { ok: false, name: 'Rafael Teixeira', msg: 'Vencida em 27/10. Pague no app ou na recepção', how: 'Digital', t: '18:43' },
  { ok: true, name: 'Helena Prado', msg: 'Helena, mensalidade vence em 11/11', how: 'QR do app', t: '18:43' },
  { ok: false, name: 'Caio Ramos', msg: 'Seu plano libera das 6h às 16h', how: 'Digital', t: '18:44' },
  { ok: true, name: 'Bruno Siqueira', msg: 'Feliz aniversário, Bruno!', how: 'Facial', t: '18:45' },
  { ok: true, name: 'Letícia Nascimento', msg: 'Pix confirmado. Bom treino!', how: 'QR do app', t: '18:46' },
];

function useCycle(n, ms) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduced()) return;
    const t = setInterval(() => setI((x) => (x + 1) % n), ms);
    return () => clearInterval(t);
  }, [n, ms]);
  return [i, setI];
}

function Turnstile() {
  const [i] = useCycle(PASSES.length, 2600);
  const p = PASSES[i];
  return (
    <div className="turnstile" aria-label="Display da catraca mostrando a decisão de acesso">
      <div className="ts-screen">
        <div key={i} className="ts-swap">
          <div className={`ts-status ${p.ok ? 'ok' : 'no'}`}>{p.ok ? 'Liberado' : 'Bloqueado'}</div>
          <div className="ts-name">{p.name}</div>
          <div className="ts-msg">{p.msg}</div>
        </div>
        <div className="ts-meta">
          <span>Catraca 1, entrada</span>
          <span>
            {p.how}, {p.t}
          </span>
        </div>
      </div>
      <div className="ts-arms">
        <div className="ts-led">
          <i className={p.ok ? 'g' : ''} />
          <i className={p.ok ? '' : 'r'} />
        </div>
        <div className="ts-sensor" />
      </div>
    </div>
  );
}


/** Cada regra mostrada como a mensagem que o aluno vê no display da catraca. */
const RULES = [
  { t: 'Inadimplência', ok: false, msg: 'Vencida em 27/10. Pague no app ou na recepção', d: 'Passou da tolerância que você definiu, a catraca segura. O aluno paga o Pix no app e entra na hora.' },
  { t: 'Horário do plano', ok: false, msg: 'Seu plano libera das 6h às 16h', d: 'Plano diurno entra de segunda a sexta, no horário combinado. Fora disso, o display diz o porquê.' },
  { t: 'Atestado', ok: false, msg: 'Traga um atestado médico atualizado', d: 'Atestado vencido bloqueia a entrada, se a sua academia exigir. A validade fica no cadastro.' },
  { t: 'Antipassback', ok: false, msg: 'Registre a saída antes de entrar de novo', d: 'Não dá para passar a digital duas vezes e colocar um amigo para dentro.' },
  { t: 'Trancamento', ok: false, msg: 'Trancada até 22/11', d: 'Viagem ou lesão: tranca de 7 dias até o limite do plano, o contrato estende e as parcelas andam junto.' },
  { t: 'Lotação', ok: false, msg: 'Lotação máxima atingida. Aguarde alguns minutos', d: 'Você define quantas pessoas cabem; a contagem de quem está dentro é em tempo real.' },
  { t: 'Aviso de vencimento', ok: true, msg: 'Helena, mensalidade vence em 11/11', d: 'Quem está em dia entra, e já sai avisado do próximo vencimento. Menos cobrança no balcão.' },
  { t: 'Saída livre', ok: true, msg: 'Até logo, Mariana', d: 'Ninguém fica preso: a saída nunca é bloqueada, só registrada.' },
];

const APP_POINTS = [
  ['Treino com guia de execução', 'Cada exercício abre com fotos de uma pessoa real nas posições inicial e final, o músculo destacado no corpo, os passos e os erros mais comuns. Séries marcadas com um toque e cronômetro de descanso.'],
  ['Cardio com GPS', 'Corrida, caminhada e bike com distância, ritmo e calorias pelo GPS do celular. Esteira e bike da academia entram à mão. Recorde pessoal avisado na hora.'],
  ['Story para o Instagram', 'Terminou o treino, o aluno tira uma foto e o app monta o story com os números por cima, marcando a academia. A sua academia aparece no feed de quem treina nela.'],
  ['Pix que libera a catraca', 'Mensalidade paga por Pix, cartão ou boleto. A confirmação chega sozinha e o aluno entra. Débito automático sem ocupar o limite do cartão.'],
];

/** Depoimentos entram aqui quando houver cliente real: { quote, name, gym, city, photo }. Vazio, a seção não aparece. */
const TESTIMONIALS = [];

function PhoneScreens({ active }) {
  return (
    <div className="phone">
      <div className="notch" />
      <div className="scr">
        <div className={active === 0 ? 'on' : ''}>
          <div style={{ fontSize: 12, color: '#56606b' }}>Academia Contrapeso</div>
          <b style={{ fontSize: 20, fontVariationSettings: "'wdth' 112", fontWeight: 800, display: 'block', marginBottom: 10 }}>Boa noite, Mariana</b>
          <div className="m-card" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 12, alignItems: 'center' }}>
            <span className="m-letter">C</span>
            <div>
              <div style={{ fontSize: 11, color: '#56606b' }}>Treino de hoje</div>
              <b style={{ fontSize: 14 }}>Pernas, Panturrilha</b>
              <div style={{ fontSize: 11, color: '#56606b' }}>6 exercícios, 9/22 séries</div>
            </div>
          </div>
          {[
            ['Agachamento livre', '4 x 8, 60 kg', [1, 1, 1, 0]],
            ['Leg press 45°', '4 x 12, 180 kg', [1, 1, 0, 0]],
            ['Cadeira extensora', '3 x 12-15, 45 kg', [0, 0, 0]],
          ].map(([n, m, sets]) => (
            <div className="m-card" key={n}>
              <b style={{ fontSize: 13.5 }}>{n}</b>
              <div style={{ fontSize: 11.5, color: '#56606b' }}>{m}</div>
              <div className="m-row">
                {sets.map((s, i) => (
                  <span key={i} className={`m-set ${s ? 'on' : ''}`}>
                    {s ? '✓' : i + 1}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className={active === 1 ? 'on' : ''}>
          <div style={{ fontSize: 12, color: '#56606b' }}>Corrida, GPS</div>
          <div className="m-big" style={{ marginTop: 12 }}>
            4,82 <span style={{ fontSize: 18, fontWeight: 700 }}>km</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
            {[
              ['28:41', 'tempo'],
              ["5'57\"", 'ritmo /km'],
              ['312', 'kcal'],
            ].map(([v, l]) => (
              <div className="m-card" key={l} style={{ margin: 0, padding: 10 }}>
                <b style={{ fontSize: 17, fontVariationSettings: "'wdth' 120", fontWeight: 800 }}>{v}</b>
                <div style={{ fontSize: 10.5, color: '#56606b' }}>{l}</div>
              </div>
            ))}
          </div>
          <svg viewBox="0 0 260 180" style={{ width: '100%', marginTop: 14, background: '#fafbfc', borderRadius: 10 }}>
            <path d="M20 150 C 40 90, 80 70, 110 100 S 170 40, 200 70 S 230 130, 240 40" fill="none" stroke="#1f4e9c" strokeWidth="4" strokeLinecap="round" strokeDasharray="520" strokeDashoffset={active === 1 ? 0 : 520} style={{ transition: 'stroke-dashoffset 2.4s ease 300ms' }} />
            <circle cx="240" cy="40" r="6" fill="#1f4e9c" />
          </svg>
          <div style={{ background: '#1b222b', color: '#fff', borderRadius: 10, padding: 12, marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13 }}>Pausar</span>
            <b style={{ fontVariationSettings: "'wdth' 125", fontWeight: 900, fontSize: 18 }}>Concluir</b>
          </div>
        </div>
        <div className={active === 2 ? 'on' : ''}>
          <div className="m-story">
            <div>
              <div style={{ fontSize: 11, color: '#9aa6b1' }}>Academia Contrapeso</div>
              <div className="d" style={{ fontSize: 34, marginTop: 6 }}>Treino C<br />feito</div>
            </div>
            <div>
              <div className="d" style={{ fontSize: 58, color: '#fff' }}>22</div>
              <div style={{ fontSize: 12, color: '#9aa6b1' }}>séries, 61 min</div>
            </div>
            <div style={{ fontSize: 11.5, color: '#9aa6b1' }}>@academiacontrapeso · @fitmanager.app</div>
          </div>
          <div style={{ background: '#1f4e9c', color: '#fff', borderRadius: 10, padding: 12, marginTop: 12, textAlign: 'center', fontWeight: 700, fontSize: 14 }}>Postar no Instagram</div>
        </div>
        <div className={active === 3 ? 'on' : ''}>
          <div style={{ fontSize: 12, color: '#56606b' }}>Anual fidelidade, parcela 8 de 12</div>
          <div className="m-big" style={{ marginTop: 10 }}>R$ 109,90</div>
          <div style={{ background: '#fff', borderRadius: 10, padding: 12, marginTop: 14, display: 'grid', placeItems: 'center' }}>
            <svg viewBox="0 0 21 21" width="150" height="150" shapeRendering="crispEdges">
              {Array.from({ length: 21 * 21 }, (_, i) => {
                const x = i % 21, y = Math.floor(i / 21);
                const f = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
                const on = f ? !(x % 6 === 1 || x % 6 === 5 || y % 6 === 1 || y % 6 === 5) && (x % 7 !== 6 && y % 7 !== 6) : (x * 7 + y * 13 + x * y) % 3 === 0;
                return on ? <rect key={i} x={x} y={y} width="1" height="1" fill="#000" /> : null;
              })}
            </svg>
          </div>
          <div style={{ background: '#dfefe5', color: '#2c7a4b', borderRadius: 8, padding: 10, marginTop: 12, fontSize: 13, fontWeight: 600, borderLeft: '3px solid #2c7a4b' }}>Pagamento confirmado. A catraca já libera sua entrada.</div>
        </div>
      </div>
    </div>
  );
}


/** Fita da catraca correndo: as mesmas passagens do display, em linha. */
function FeedLine() {
  const list = [...PASSES, ...PASSES];
  return (
    <div className="feedline" aria-hidden="true">
      <div className="track">
        {list.map((p, i) => (
          <span key={i} className={`fl ${p.ok ? '' : 'no'}`}>
            <time>{p.t}</time>
            <b>{p.name}</b>
            <em>{p.ok ? 'Liberado' : 'Bloqueado'}</em>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Recorte do painel "Hoje": lotação, barras por hora e últimas passagens, com os mesmos estilos do produto. */
function PanelCrop() {
  const hours = [2, 5, 9, 14, 12, 7, 4, 3, 5, 8, 11, 16, 19, 15, 9, 4];
  const max = Math.max(...hours);
  return (
    <div className="crop">
      <div className="panel occupancy" style={{ padding: 18, gap: 14 }}>
        <div className="occ-top" style={{ gap: 20 }}>
          <div className="occ-now">
            <span className="num" style={{ fontSize: 56 }}>
              47<span className="of" style={{ fontSize: 18 }}>/110</span>
            </span>
            <div className="occ-label" style={{ fontSize: 12, marginTop: 4 }}>pessoas treinando agora</div>
          </div>
          <div className="occ-stats" style={{ gap: 18 }}>
            <div>
              <span className="num" style={{ fontSize: 22 }}>212</span>
              <span style={{ fontSize: 11 }}>entradas hoje</span>
            </div>
            <div>
              <span className="num" style={{ fontSize: 22, color: 'var(--red)' }}>6</span>
              <span style={{ fontSize: 11 }}>bloqueios</span>
            </div>
          </div>
        </div>
        <div className="gauge" style={{ height: 10 }}>
          {Array.from({ length: 30 }, (_, i) => (
            <i key={i} className={i < 13 ? 'on' : ''} />
          ))}
        </div>
        <div className="hours" style={{ '--cols': hours.length, height: 64 }}>
          {hours.map((h, i) => (
            <div key={i} className={`h ${i === 12 ? 'now' : ''} ${i > 12 ? 'future' : ''}`}>
              <div className="bar" style={{ height: `${(h / max) * 100}%`, animation: 'none' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RuleScreen({ r }) {
  return (
    <Rv className="rule-screen">
      <div className="rs-display">
        <span className={`rs-status ${r.ok ? 'ok' : 'no'}`}>{r.ok ? 'Liberado' : 'Bloqueado'}</span>
        <span className="rs-msg">{r.msg}</span>
      </div>
      <h4>{r.t}</h4>
      <p>{r.d}</p>
    </Rv>
  );
}

function AppShow() {
  const [active, setActive] = useCycle(APP_POINTS.length, 4200);
  return (
    <div className="app-show">
      <Rv className="phone-stage">
        <div className="blob" />
        <PhoneScreens active={active} />
      </Rv>
      <div>
        <Rv as="h2" className="d d-lg">
          O app que o aluno abre todo dia.
        </Rv>
        <Rv d={1} className="app-points" style={{ marginTop: 32 }}>
          {APP_POINTS.map(([t, d], i) => (
            <div key={t} className="point" aria-current={active === i} onMouseEnter={() => setActive(i)} onClick={() => setActive(i)}>
              <div>
                <h4>{t}</h4>
                <p>{d}</p>
              </div>
            </div>
          ))}
        </Rv>
      </div>
    </div>
  );
}

function LiveDemo() {
  const [rows, setRows] = useState(PASSES.slice(0, 4));
  useEffect(() => {
    if (reduced()) return;
    let i = 4;
    const t = setInterval(() => {
      setRows((r) => [PASSES[i % PASSES.length], ...r].slice(0, 4));
      i++;
    }, 3000);
    return () => clearInterval(t);
  }, []);
  return (
    <Rv className="live">
      <div>
        <h2 className="d d-lg" style={{ margin: 0 }}>
          Entre na academia de demonstração.
        </h2>
        <p className="body" style={{ marginTop: 18 }}>
          A Academia Contrapeso tem 150 alunos, 14 meses de mensalidades e 4 mil passagens de catraca. Venda um plano, bloqueie um inadimplente, receba um Pix e veja a catraca liberar. Sem cadastro.
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 28, flexWrap: 'wrap' }}>
          <Link to="/entrar?demo=dono" className="b lime-b">
            Painel do dono <Arrow />
          </Link>
          <Link to="/entrar?app=1" className="b">
            App do aluno <Arrow />
          </Link>
        </div>
      </div>
      <div className="live-feed" aria-live="off">
        {rows.map((p, i) => (
          <div key={`${p.t}-${p.name}-${i}`} className={`live-row ${p.ok ? '' : 'no'}`}>
            <time>{p.t}</time>
            <div>
              <div className="w">{p.name}</div>
              <div className="m">{p.msg}</div>
            </div>
            <span className="s">{p.ok ? 'Liberado' : 'Bloqueado'}</span>
          </div>
        ))}
      </div>
    </Rv>
  );
}

export default function Landing() {
  const heroRef = useRef();
  useGlow(heroRef);
  return (
    <div className="fz">
      <BgVideo />
      <header className="nav">
        <Link to="/" className="logo">
          <BrandMark size={34} />
          <b>FitManager</b>
        </Link>
        <nav>
          <a href="#produto" className="hide-m">Produto</a>
          <a href="#regras" className="hide-m">Regras</a>
          <a href="#app" className="hide-m">App</a>
          <a href="#precos" className="hide-m">Preços</a>
          <Link to="/entrar">Entrar</Link>
          <Link to="/cadastro" className="b lime-b sm">
            Testar grátis <Arrow />
          </Link>
        </nav>
      </header>

      <main>
        <section className="wrap hero" ref={heroRef}>
          <div className="hero-glow" />
          <div>
            <h1 className="d d-xl">
              <span className="ln" style={{ '--i': 0 }}>
                <span>A catraca</span>
              </span>
              <span className="ln" style={{ '--i': 1 }}>
                <span>sabe quem</span>
              </span>
              <span className="ln" style={{ '--i': 2 }}>
                <span>pagou.</span>
              </span>
            </h1>
            <p className="body">
              Gestão de academia com a catraca ligada ao financeiro. Quem está em dia entra com a digital ou o rosto. Quem atrasou vê o motivo no display e paga o Pix pelo app. O dono acompanha tudo de um painel só.
            </p>
            <div className="ctas">
              <Link to="/cadastro" className="b lime-b">
                Testar 14 dias grátis <Arrow />
              </Link>
              <a href="#demo" className="b">
                Ver funcionando <Arrow />
              </a>
            </div>
          </div>
          <div className="stage">
            <div className="spot" />
            <Turnstile />
          </div>
        </section>

        <FeedLine />

        <section className="band wrap" id="produto">
          <div className="band-head">
            <Rv as="h2" line className="d d-lg">
              Três telas, uma academia.
            </Rv>
            <Rv d={1} as="p" className="body">
              Cada pessoa vê o que precisa para o seu trabalho. Dono, recepção e professor têm permissões diferentes. O aluno só vê o que é dele.
            </Rv>
          </div>
          <div className="proof">
            <Rv className="proof-item">
              <PanelCrop />
              <h3 className="d d-md">Painel do dono</h3>
              <p>Quem está treinando agora, o pico de cada dia da semana, receita, recorrência e quem cobrar primeiro. Cada bloqueio da catraca com o motivo.</p>
            </Rv>
            <Rv d={1} className="proof-item">
              <div className="crop crop-phone">
                <PhoneScreens active={0} />
              </div>
              <h3 className="d d-md">App do aluno</h3>
              <p>Treino com guia de execução, cardio com GPS, mensalidade por Pix com confirmação automática e story pronto para o Instagram.</p>
            </Rv>
            <Rv d={2} className="proof-item">
              <div className="crop">
                <div className="turnstile" style={{ padding: 14, borderRadius: 16 }}>
                  <div className="ts-screen" style={{ minHeight: 150, padding: 16 }}>
                    <div>
                      <div className="ts-status no" style={{ fontSize: 30 }}>Bloqueado</div>
                      <div className="ts-name" style={{ fontSize: 16 }}>Rafael Teixeira</div>
                      <div className="ts-msg" style={{ fontSize: 13 }}>Vencida em 27/10. Pague no app ou na recepção</div>
                    </div>
                    <div className="ts-meta" style={{ fontSize: 11 }}>
                      <span>Catraca 1, entrada</span>
                      <span>Digital, 18:43</span>
                    </div>
                  </div>
                </div>
              </div>
              <h3 className="d d-md">Catraca</h3>
              <p>Control iD no modo online: digital, facial e cartão. Leitor de QR para o passe do app, liberação remota com justificativa e funcionamento sem internet.</p>
            </Rv>
          </div>
        </section>

        <section className="band lime-band" id="regras">
          <div className="wrap">
            <div className="band-head">
              <Rv as="h2" className="d d-lg">
                Regras que a recepção não precisa decorar.
              </Rv>
              <Rv d={1} as="p" className="body">
                Você configura uma vez por plano. O sistema aplica em cada passagem, cada cobrança e cada cancelamento, e a primeira regra que falhar vira a mensagem no display. Estas são as mensagens que o aluno lê.
              </Rv>
            </div>
            <div className="rule-grid">
              {RULES.map((r) => (
                <RuleScreen key={r.t} r={r} />
              ))}
            </div>
          </div>
        </section>

        <section className="band wrap" id="app">
          <AppShow />
        </section>

        {TESTIMONIALS.length > 0 && (
          <section className="band wrap">
            <div className="quotes">
              {TESTIMONIALS.map((q) => (
                <Rv key={q.name} className="quote">
                  {q.photo && <img src={q.photo} alt={q.name} />}
                  <p>“{q.quote}”</p>
                  <b>{q.name}</b>
                  <span>
                    {q.gym}, {q.city}
                  </span>
                </Rv>
              ))}
            </div>
          </section>
        )}

        <section className="band wrap" id="precos">
          <div className="band-head">
            <Rv as="h2" line className="d d-lg">
              Preço por academia, não por aluno.
            </Rv>
            <Rv d={1} as="p" className="body">
              Sem taxa de implantação, cancele quando quiser. Nos pagamentos online, 0,9% por transação, já descontado antes de cair na sua conta.
            </Rv>
          </div>
          <div className="prices">
            <Rv className="price-card">
              <h3 className="d d-md">Essencial</h3>
              <div className="amt">
                R$ 189<small>/mês</small>
              </div>
              <ul>
                <li>Até 300 alunos ativos</li>
                <li>Painel, financeiro e Pix com baixa automática</li>
                <li>1 catraca</li>
                <li>App do aluno com treino e passe QR</li>
              </ul>
              <Link to="/cadastro?plano=essencial" className="b">
                Começar <Arrow />
              </Link>
            </Rv>
            <Rv d={1} className="price-card hot">
              <h3 className="d d-md">Performance</h3>
              <div className="amt">
                R$ 349<small>/mês</small>
              </div>
              <ul>
                <li>Até 1.000 alunos ativos</li>
                <li>Catracas ilimitadas, facial e digital</li>
                <li>Cardio com GPS, dieta e story para o Instagram</li>
                <li>CRM, retenção e débito automático</li>
              </ul>
              <Link to="/cadastro?plano=performance" className="b">
                Começar <Arrow />
              </Link>
            </Rv>
            <Rv d={2} className="price-card">
              <h3 className="d d-md">Rede</h3>
              <div className="amt" style={{ fontSize: 40 }}>
                Sob consulta
              </div>
              <ul>
                <li>Mais de 1.000 alunos ou várias unidades</li>
                <li>Implantação acompanhada</li>
                <li>App com a marca da academia nas lojas</li>
              </ul>
              <a href="mailto:comercial@fitmanager.com.br" className="b">
                Falar com o comercial <Arrow />
              </a>
            </Rv>
          </div>
        </section>

        <section className="band wrap" id="demo" style={{ paddingTop: 0 }}>
          <LiveDemo />
        </section>
      </main>

      <footer>
        <div className="wrap">
          <div className="cols">
            <div>
              <Link to="/" className="logo" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, textDecoration: 'none', padding: 0 }}>
                <BrandMark size={30} />
                <b className="d d-sm" style={{ fontSize: 22 }}>FitManager</b>
              </Link>
              <p className="fg2" style={{ marginTop: 12, maxWidth: '36ch' }}>Gestão de academias com catraca, financeiro e app do aluno no mesmo sistema.</p>
            </div>
            <div>
              <h5>Produto</h5>
              <a href="#produto">Catraca</a>
              <a href="#app">App do aluno</a>
              <a href="#precos">Preços</a>
            </div>
            <div>
              <h5>Acesso</h5>
              <Link to="/entrar">Painel da academia</Link>
              <Link to="/entrar?app=1">App do aluno</Link>
              <Link to="/cadastro">Criar conta</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
