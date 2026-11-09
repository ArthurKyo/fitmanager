import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { get } from '../api.js';
import { SITUATION } from './format.js';

/** Busca dados e expõe recarga. */
export function useData(path, deps = []) {
  const [state, set] = useState({ data: null, error: null, loading: true });
  const load = useCallback(() => {
    if (!path) return;
    set((s) => ({ ...s, loading: true }));
    get(path)
      .then((data) => set({ data, error: null, loading: false }))
      .catch((error) => set({ data: null, error, loading: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(load, [load]);
  return { ...state, reload: load };
}

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [t, setT] = useState(null);
  const timer = useRef();
  const show = useCallback((msg, kind = 'ok') => {
    clearTimeout(timer.current);
    setT({ msg, kind });
    timer.current = setTimeout(() => setT(null), 3800);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && (
        <div className={`toast ${t.kind === 'err' ? 'err' : ''}`} role="status">
          {t.msg}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

export function Modal({ title, sub, onClose, children, wide }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {sub && <p className="muted small" style={{ marginTop: 4 }}>{sub}</p>}
          </div>
          <button className="btn ghost sm" onClick={onClose} aria-label="Fechar">
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Situation({ s, label }) {
  const def = SITUATION[s] || { tone: '', label: s };
  return <span className={`tag ${def.tone}`}>{label || def.label}</span>;
}

export function Loading() {
  return <div className="empty">Carregando…</div>;
}
export function ErrorBox({ error, retry }) {
  return (
    <div className="alert red">
      {error?.message || 'Não foi possível carregar.'}{' '}
      {retry && (
        <button className="btn sm" style={{ marginLeft: 8 }} onClick={retry}>
          Tentar de novo
        </button>
      )}
    </div>
  );
}

export function QR({ value, size = 232 }) {
  const ref = useRef();
  useEffect(() => {
    if (ref.current && value) QRCode.toCanvas(ref.current, value, { width: size, margin: 0, errorCorrectionLevel: 'M' });
  }, [value, size]);
  return <canvas ref={ref} width={size} height={size} aria-label="QR code" />;
}

export function useForm(initial) {
  const [v, setV] = useState(initial);
  const bind = (k, type) => ({
    value: type === 'checkbox' ? undefined : v[k] ?? '',
    checked: type === 'checkbox' ? !!v[k] : undefined,
    onChange: (e) => setV((s) => ({ ...s, [k]: type === 'checkbox' ? e.target.checked : e.target.value })),
  });
  return [v, setV, bind];
}

/** Ícones: Bootstrap Icons. Os nomes antigos continuam valendo. */
const BI = {
  today: 'activity', gate: 'door-open', users: 'people', money: 'cash-coin', funnel: 'funnel', dumbbell: 'lightning-charge', food: 'egg-fried',
  tag: 'tags', chart: 'bar-chart-line', gear: 'gear', x: 'x-lg', plus: 'plus-lg', menu: 'list', search: 'search', qr: 'qr-code', card: 'credit-card',
  user: 'person', check: 'check-lg', copy: 'copy', phone: 'whatsapp', logout: 'box-arrow-right', run: 'person-walking', help: 'question-circle',
};
export function Icon({ name, size }) {
  return <i className={`bi bi-${BI[name] || name}`} style={size ? { fontSize: size } : undefined} aria-hidden="true" />;
}

export function BrandMark({ size = 28 }) {
  return (
    <svg className="brand-mark" viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#1B222B" />
      <circle cx="32" cy="32" r="19" fill="none" stroke="#C42A2A" strokeWidth="7" />
      <circle cx="32" cy="32" r="5" fill="#FAFBFC" />
    </svg>
  );
}
