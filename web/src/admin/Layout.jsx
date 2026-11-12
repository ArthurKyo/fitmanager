import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { DEMO, getSession, openStream, setSession } from '../api.js';
import { BrandMark, Icon } from '../ui/kit.jsx';

const NAV = [
  { to: '/painel', end: true, label: 'Hoje', icon: 'today', roles: ['dono', 'recepcao', 'professor'] },
  { to: '/painel/catraca', label: 'Catraca', icon: 'gate', roles: ['dono', 'recepcao', 'professor'] },
  { to: '/painel/alunos', label: 'Alunos', icon: 'users', roles: ['dono', 'recepcao', 'professor'] },
  { to: '/painel/financeiro', label: 'Financeiro', icon: 'money', roles: ['dono', 'recepcao'] },
  { to: '/painel/crm', label: 'CRM', icon: 'funnel', roles: ['dono', 'recepcao'] },
  { gap: true },
  { to: '/painel/treinos', label: 'Treinos', icon: 'dumbbell', roles: ['dono', 'professor', 'recepcao'] },
  { to: '/painel/dietas', label: 'Dietas', icon: 'food', roles: ['dono', 'professor', 'recepcao'] },
  { gap: true },
  { to: '/painel/planos', label: 'Planos', icon: 'tag', roles: ['dono', 'recepcao'] },
  { to: '/painel/relatorios', label: 'Relatórios', icon: 'chart', roles: ['dono'] },
  { to: '/painel/configuracoes', label: 'Configurações', icon: 'gear', roles: ['dono'] },
];
const ROLE = { dono: 'Dono', recepcao: 'Recepção', professor: 'Professor' };

/** Assina o stream da catraca. Reconecta sozinho (EventSource). */
export function useLiveAccess(onEvent) {
  const [online, setOnline] = useState(false);
  const cb = useRef(onEvent);
  cb.current = onEvent;
  useEffect(() => {
    if (navigator.webdriver && !DEMO) return undefined; // capturas automatizadas: sem stream aberto
    return openStream((ev) => cb.current?.(ev), setOnline);
  }, []);
  return online;
}

export default function AdminLayout() {
  const s = getSession();
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [loc.pathname]);
  const role = s.user.role;

  return (
    <div className="shell">
      <div className="mobile-bar">
        <button onClick={() => setOpen(true)} aria-label="Abrir menu">
          <Icon name="menu" size={22} />
        </button>
        <b>{s.gym.name}</b>
      </div>
      <aside className={`side ${open ? 'open' : ''}`}>
        <NavLink to="/painel" className="brand">
          <BrandMark />
          <b>FitManager</b>
        </NavLink>
        <div className="side-gym">
          <b>{s.gym.name}</b>
          {s.user.name.split(' ')[0]}, {ROLE[role]}
        </div>
        {NAV.map((n, i) =>
          n.gap ? (
            <div className="side-gap" key={i} />
          ) : n.roles.includes(role) ? (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav ${isActive ? 'active' : ''}`}>
              <Icon name={n.icon} />
              {n.label}
            </NavLink>
          ) : null
        )}
        <div className="side-foot">
          <button
            onClick={() => {
              setSession(null);
              nav('/entrar');
            }}
          >
            Sair
          </button>
        </div>
      </aside>
      <main className="main">
        <div className="page" key={loc.pathname}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
