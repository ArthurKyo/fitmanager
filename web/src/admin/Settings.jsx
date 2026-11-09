import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { post, put } from '../api.js';
import { useData, Loading, ErrorBox, Modal, useToast, Icon } from '../ui/kit.jsx';
import { date, time } from '../ui/format.js';

const ROLE = { dono: 'Dono', recepcao: 'Recepção', professor: 'Professor' };

function Gym() {
  const toast = useToast();
  const { data, error, reload } = useData('/settings/gym');
  const [v, setV] = useState(null);
  useEffect(() => data && setV(data), [data]);
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!v) return <Loading />;
  const b = (k, num) => ({ value: v[k] ?? '', onChange: (e) => setV({ ...v, [k]: num ? Number(e.target.value) : e.target.value }) });
  async function save(e) {
    e.preventDefault();
    try {
      await put('/settings/gym', v);
      toast('Configurações salvas');
    } catch (ex) {
      toast(ex.message, 'err');
    }
  }
  return (
    <form className="stack-lg" onSubmit={save}>
      <section className="panel panel-pad stack">
        <h3>Academia</h3>
        <div className="grid-2">
          <label className="field">
            <span>Nome</span>
            <input className="input" {...b('name')} />
          </label>
          <label className="field">
            <span>CNPJ</span>
            <input className="input" {...b('cnpj')} />
          </label>
        </div>
        <div className="grid-2">
          <label className="field">
            <span>Telefone</span>
            <input className="input" {...b('phone')} />
          </label>
          <label className="field">
            <span>Endereço</span>
            <input className="input" {...b('address')} />
          </label>
        </div>
        <label className="field">
          <span>Instagram da academia</span>
          <input className="input" placeholder="sem @" value={v.instagram || ''} onChange={(e) => setV({ ...v, instagram: e.target.value.replace(/^@/, '') })} />
          <small>O app sugere ao aluno marcar este perfil quando ele compartilha um treino.</small>
        </label>
      </section>
      <section className="panel panel-pad stack">
        <h3>Recebimento por Pix</h3>
        <p className="small muted">O app do aluno gera o Pix copia e cola com valor, multa e juros já calculados. A baixa automática depende do webhook do seu banco ou gateway.</p>
        <div className="grid-3">
          <label className="field">
            <span>Chave Pix</span>
            <input className="input" {...b('pix_key')} />
          </label>
          <label className="field">
            <span>Nome do recebedor</span>
            <input className="input" maxLength={25} {...b('pix_merchant')} />
          </label>
          <label className="field">
            <span>Cidade</span>
            <input className="input" maxLength={15} {...b('pix_city')} />
          </label>
        </div>
      </section>
      <section className="panel panel-pad stack">
        <h3>Regras da catraca</h3>
        <div className="grid-3">
          <label className="field">
            <span>Tolerância de atraso (dias)</span>
            <input className="input" type="number" min="0" max="30" {...b('overdue_tolerance_days', true)} />
            <small>Depois disso, a catraca bloqueia quem tem fatura vencida.</small>
          </label>
          <label className="field">
            <span>Lotação máxima</span>
            <input className="input" type="number" min="0" {...b('max_capacity', true)} />
            <small>0 = sem controle de lotação.</small>
          </label>
          <label className="field">
            <span>Antipassback (minutos)</span>
            <input className="input" type="number" min="0" {...b('antipassback_minutes', true)} />
            <small>Sem saída registrada, nova entrada só depois desse tempo. 0 desliga.</small>
          </label>
        </div>
        <div className="grid-3">
          <label className="field">
            <span>Abre às (h)</span>
            <input className="input" type="number" min="0" max="23" {...b('open_hour', true)} />
          </label>
          <label className="field">
            <span>Fecha às (h)</span>
            <input className="input" type="number" min="1" max="24" {...b('close_hour', true)} />
          </label>
          <label className="check" style={{ alignSelf: 'end', paddingBottom: 8 }}>
            <input type="checkbox" checked={!!v.require_medical} onChange={(e) => setV({ ...v, require_medical: e.target.checked ? 1 : 0 })} />
            Exigir atestado médico válido
          </label>
        </div>
      </section>
      <div>
        <button className="btn primary">Salvar configurações</button>
      </div>
    </form>
  );
}

const PROVIDER = { manual: 'Manual: a recepção confirma', simulado: 'Modo de testes', asaas: 'Asaas' };

function Payments() {
  const toast = useToast();
  const { data, error, reload } = useData('/settings/payments');
  const [provider, setProvider] = useState(null);
  const [env, setEnv] = useState('sandbox');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) {
      setProvider(data.provider);
      setEnv(data.env);
    }
  }, [data]);
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data || !provider) return <Loading />;
  const fmt = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await put('/settings/payments', { provider, env, api_key: key || undefined });
      setKey('');
      toast(provider === 'asaas' ? 'Conta Asaas conectada' : 'Recebimentos atualizados');
      reload();
    } catch (ex) {
      toast(ex.message, 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack-lg">
      {data.provider !== 'manual' && (
        <section className="panel kpis">
          <div>
            <span>Recebido online no mês</span>
            <b className="num">{fmt(data.month.gross_cents)}</b>
            <div className="note muted">{data.month.payments} pagamentos com baixa automática</div>
          </div>
          <div>
            <span>Recuperado de atraso</span>
            <b className="num" style={{ color: 'var(--green)' }}>{fmt(data.month.recovered_cents)}</b>
            <div className="note muted">pago pelo app depois do vencimento</div>
          </div>
          <div>
            <span>Débito automático</span>
            <b className="num">{fmt(data.month.autopay_cents)}</b>
            <div className="note muted">{data.autopay_members} alunos com cartão no automático</div>
          </div>
          <div>
            <span>Taxa FitManager no mês</span>
            <b className="num">{fmt(data.month.fees_cents)}</b>
            <div className="note muted">
              {String(data.fee.pct).replace('.', ',')}% por pagamento, mínimo {fmt(data.fee.min_cents)}
            </div>
          </div>
        </section>
      )}
      <form className="panel panel-pad stack" onSubmit={save}>
        <div>
          <h3>Como a academia recebe</h3>
          <p className="small muted">
            Com recebimento online, o aluno paga por Pix, cartão ou boleto no app. A baixa é automática, a catraca libera na hora e o dinheiro cai na conta
            da academia. A taxa do FitManager é de {String(data.fee.pct).replace('.', ',')}% por pagamento (mensalidade de R$ 149,90 paga{' '}
            {fmt(data.fee.example_cents)}), descontada automaticamente. A taxa do processador é cobrada à parte, conforme o contrato da academia com ele.
          </p>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          {['manual', 'simulado', 'asaas'].map((p) => (
            <label key={p} className="check">
              <input type="radio" checked={provider === p} onChange={() => setProvider(p)} />
              <span>
                <b>{PROVIDER[p]}</b>
                <span className="muted small" style={{ display: 'block' }}>
                  {p === 'manual' && 'Pix estático da chave da academia. Alguém confere o extrato e dá baixa.'}
                  {p === 'simulado' && 'Tudo funciona, mas nenhum dinheiro real é movimentado. Use para treinar a equipe.'}
                  {p === 'asaas' && 'Pix, cartão com débito automático e boleto, com baixa automática pelo webhook.'}
                </span>
              </span>
            </label>
          ))}
        </div>
        {provider === 'asaas' && (
          <div className="stack" style={{ borderTop: '1px solid var(--rule-soft)', paddingTop: 14 }}>
            <div className="grid-2">
              <label className="field">
                <span>Ambiente</span>
                <select className="select" value={env} onChange={(e) => setEnv(e.target.value)}>
                  <option value="sandbox">Sandbox (testes)</option>
                  <option value="production">Produção</option>
                </select>
              </label>
              <label className="field">
                <span>Chave de API da conta Asaas da academia</span>
                <input className="input" type="password" autoComplete="off" placeholder={data.has_key ? 'Chave salva. Cole outra para trocar.' : '$aact_…'} value={key} onChange={(e) => setKey(e.target.value)} />
                <small>No Asaas: Integrações, Chave de API. A chave é guardada criptografada.</small>
              </label>
            </div>
            {data.provider === 'asaas' && data.webhook_url && (
              <div className="alert blue stack" style={{ gap: 6 }}>
                <span>
                  No Asaas, em Integrações e Webhooks, crie um webhook de cobranças com estes dados. Sem ele, o pagamento não dá baixa sozinho.
                </span>
                <span>
                  URL: <b style={{ wordBreak: 'break-all' }}>{data.webhook_url}</b>
                </span>
                <span>
                  Token de autenticação: <b style={{ wordBreak: 'break-all' }}>{data.webhook_token}</b>
                </span>
              </div>
            )}
          </div>
        )}
        <div>
          <button className="btn primary" disabled={busy}>
            {busy ? 'Validando…' : provider === 'asaas' ? 'Conectar e salvar' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Staff() {
  const toast = useToast();
  const { data, error, reload } = useData('/settings/staff');
  const [add, setAdd] = useState(false);
  const [v, setV] = useState({ name: '', email: '', role: 'recepcao' });
  const [created, setCreated] = useState(null);
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Loading />;
  async function create(e) {
    e.preventDefault();
    try {
      setCreated(await post('/settings/staff', v));
      setAdd(false);
      reload();
    } catch (ex) {
      toast(ex.message, 'err');
    }
  }
  async function toggle(u) {
    try {
      await put(`/settings/staff/${u.id}`, { active: !u.active });
      reload();
    } catch (ex) {
      toast(ex.message, 'err');
    }
  }
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>Equipe</h3>
        <button className="btn sm" onClick={() => setAdd(true)}>
          <Icon name="plus" /> Adicionar pessoa
        </button>
      </div>
      <table className="table">
        <tbody>
          {data.map((u) => (
            <tr key={u.id} style={{ opacity: u.active ? 1 : 0.5 }}>
              <td>
                <b>{u.name}</b>
                <div className="tiny faint">{u.email}</div>
              </td>
              <td>{ROLE[u.role]}</td>
              <td className="right">
                <button className="btn sm ghost" onClick={() => toggle(u)}>
                  {u.active ? 'Desativar' : 'Reativar'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {add && (
        <Modal title="Adicionar pessoa à equipe" onClose={() => setAdd(false)}>
          <form className="stack" onSubmit={create}>
            <label className="field">
              <span>Nome</span>
              <input className="input" required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
            </label>
            <label className="field">
              <span>E-mail</span>
              <input className="input" type="email" required value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
            </label>
            <label className="field">
              <span>Perfil</span>
              <select className="select" value={v.role} onChange={(e) => setV({ ...v, role: e.target.value })}>
                <option value="recepcao">Recepção: alunos, matrículas, recebimentos, catraca e CRM</option>
                <option value="professor">Professor: treinos, dietas e consulta de alunos</option>
                <option value="dono">Dono: acesso total</option>
              </select>
            </label>
            <div className="modal-foot">
              <button className="btn primary">Criar acesso</button>
            </div>
          </form>
        </Modal>
      )}
      {created && (
        <Modal title="Acesso criado" onClose={() => setCreated(null)}>
          <p>
            Login <b>{created.email}</b>, senha provisória <b className="tnum">{created.temporaryPassword}</b>. Ela aparece só agora.
          </p>
        </Modal>
      )}
    </section>
  );
}

function Audit() {
  const { data } = useData('/settings/audit');
  if (!data) return <Loading />;
  const LABEL = { 'contrato.criar': 'Vendeu plano', 'contrato.trancar': 'Trancou matrícula', 'contrato.cancelar': 'Cancelou contrato', 'fatura.receber': 'Recebeu pagamento', 'fatura.cancelar': 'Cancelou fatura', 'fatura.avulsa': 'Lançou cobrança avulsa' };
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>Histórico de ações</h3>
        <span className="small muted">quem fez o quê, para auditoria</span>
      </div>
      {data.length ? (
        <ul className="list-plain">
          {data.slice(0, 80).map((a) => (
            <li key={a.id}>
              <span>
                <b>{a.user_name || 'Sistema'}</b> {LABEL[a.action] || a.action} <span className="muted">#{a.entity_id}</span>
              </span>
              <span className="tiny faint tnum">
                {date(a.created_at)} {time(a.created_at)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty">As ações da equipe aparecem aqui.</div>
      )}
    </section>
  );
}

export default function Settings() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') || 'academia');
  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Configurações</h1>
        </div>
      </div>
      {params.get('bemvindo') && (
        <div className="alert green">
          Conta criada. Confira a chave Pix e as regras da catraca, depois cadastre os planos e o primeiro aluno. Para testar sem hardware, use o simulador em Catraca.
        </div>
      )}
      <div className="tabs">
        {[
          ['academia', 'Academia e regras'],
          ['recebimentos', 'Recebimentos'],
          ['equipe', 'Equipe'],
          ['auditoria', 'Histórico'],
        ].map(([k, l]) => (
          <button key={k} aria-selected={tab === k} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'academia' && <Gym />}
      {tab === 'recebimentos' && <Payments />}
      {tab === 'equipe' && <Staff />}
      {tab === 'auditoria' && <Audit />}
    </div>
  );
}
