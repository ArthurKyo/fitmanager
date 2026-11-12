import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Arrow, reduced } from './motion.jsx';
import { createGlassCarousel } from './glassCarousel.js';

export const PLANS = [
  {
    id: 'essencial',
    name: 'Essencial',
    price: 'R$ 189',
    unit: '/mês',
    items: ['Até 300 alunos ativos', 'Painel, financeiro e Pix com baixa automática', '1 catraca', 'App do aluno com treino e passe QR'],
    cta: 'Começar',
    to: '/cadastro?plano=essencial',
  },
  {
    id: 'performance',
    name: 'Performance',
    price: 'R$ 349',
    unit: '/mês',
    hot: true,
    items: ['Até 1.000 alunos ativos', 'Catracas ilimitadas, facial e digital', 'Cardio com GPS, dieta e story para o Instagram', 'CRM, retenção e débito automático'],
    cta: 'Começar',
    to: '/cadastro?plano=performance',
  },
  {
    id: 'rede',
    name: 'Rede',
    priceText: 'Sob consulta',
    items: ['Mais de 1.000 alunos ou várias unidades', 'Implantação acompanhada', 'App com a marca da academia nas lojas'],
    cta: 'Falar com o comercial',
    href: 'mailto:comercial@fitmanager.com.br',
  },
];

function PlanLink({ plan, className, children }) {
  return plan.href ? (
    <a href={plan.href} className={className}>
      {children}
    </a>
  ) : (
    <Link to={plan.to} className={className}>
      {children}
    </Link>
  );
}

/** Grade comum: usada quando o navegador não tem WebGL. */
function PriceGrid() {
  return (
    <div className="prices">
      {PLANS.map((p) => (
        <div key={p.id} className={`price-card ${p.hot ? 'hot' : ''}`}>
          <h3 className="d d-md">{p.name}</h3>
          <div className="amt" style={p.price ? undefined : { fontSize: 40 }}>
            {p.price || p.priceText}
            {p.unit && <small>{p.unit}</small>}
          </div>
          <ul>
            {p.items.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
          <PlanLink plan={p} className="b">
            {p.cta} <Arrow />
          </PlanLink>
        </div>
      ))}
    </div>
  );
}

/**
 * Planos em carrossel com lente de vidro líquido (WebGL, ver glassCarousel.js).
 * Arraste, use as setas do teclado ou os botões. Clicar no card do centro abre o plano.
 */
export default function GlassPlans() {
  const canvas = useRef(null);
  const ctl = useRef(null);
  const nav = useNavigate();
  const [active, setActive] = useState(1);
  const [fallback, setFallback] = useState(false);

  const open = (i) => {
    const p = PLANS[i];
    if (p.href) window.location.href = p.href;
    else nav(p.to);
  };

  useEffect(() => {
    const c = createGlassCarousel(canvas.current, PLANS, { start: 1, reduced: reduced(), onActive: setActive, onOpen: open });
    if (!c) {
      setFallback(true);
      return undefined;
    }
    ctl.current = c;
    return () => c.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (fallback) return <PriceGrid />;
  const plan = PLANS[active];

  return (
    <div
      className="glass-plans"
      role="region"
      aria-roledescription="carrossel"
      aria-label="Planos do FitManager"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') (e.preventDefault(), ctl.current?.next());
        if (e.key === 'ArrowLeft') (e.preventDefault(), ctl.current?.previous());
        if (e.key === 'Enter' && e.target === e.currentTarget) open(active);
      }}
    >
      <canvas ref={canvas} className="glass-canvas" aria-hidden="true" />
      <div className="glass-bar">
        <button type="button" className="glass-arrow" aria-label="Plano anterior" onClick={() => ctl.current?.previous()}>
          <i className="bi bi-arrow-left" />
        </button>
        <div className="glass-dots" role="tablist" aria-label="Escolher plano">
          {PLANS.map((p, i) => (
            <button key={p.id} type="button" role="tab" aria-selected={i === active} className={i === active ? 'on' : ''} onClick={() => ctl.current?.goTo(i)}>
              {p.name}
            </button>
          ))}
        </div>
        <button type="button" className="glass-arrow" aria-label="Próximo plano" onClick={() => ctl.current?.next()}>
          <i className="bi bi-arrow-right" />
        </button>
      </div>
      <PlanLink plan={plan} className="b glass-cta">
        {plan.cta === 'Começar' ? `Começar no ${plan.name}` : plan.cta} <Arrow />
      </PlanLink>
      <p className="sr-only" aria-live="polite">
        {plan.name}, {plan.price ? `${plan.price} por mês` : plan.priceText}. {plan.items.join('. ')}. Plano {active + 1} de {PLANS.length}.
      </p>
    </div>
  );
}
