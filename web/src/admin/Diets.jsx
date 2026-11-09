import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { get, getSession, post } from '../api.js';
import { useData, Loading, ErrorBox, Modal, useToast, Icon } from '../ui/kit.jsx';
import { MemberPicker } from './Access.jsx';

const blankItem = () => ({ food: '', qty: '', kcal: '', protein_g: '', carbs_g: '', fat_g: '' });

function Editor({ base, onClose, onSaved }) {
  const toast = useToast();
  const [member, setMember] = useState(null);
  const [name, setName] = useState(base?.name || 'Plano alimentar');
  const [kcal, setKcal] = useState(base?.kcal_target || 2000);
  const [notes, setNotes] = useState(base?.notes || '');
  const [meals, setMeals] = useState(
    base?.meals?.map((m) => ({ name: m.name, time: m.time, items: m.items.map((i) => ({ ...i })) })) || [
      { name: 'Café da manhã', time: '07:00', items: [blankItem()] },
      { name: 'Almoço', time: '12:30', items: [blankItem()] },
      { name: 'Jantar', time: '20:00', items: [blankItem()] },
    ]
  );
  const [err, setErr] = useState('');
  const setItem = (mi, ii, k, v) => setMeals((ms) => ms.map((m, a) => (a !== mi ? m : { ...m, items: m.items.map((it, b) => (b === ii ? { ...it, [k]: v } : it)) })));
  const total = meals.reduce((s, m) => s + m.items.reduce((a, i) => a + (Number(i.kcal) || 0), 0), 0);

  async function save() {
    setErr('');
    try {
      await post('/training/diets', { member_id: member?.id, name, kcal_target: Number(kcal), notes, meals: meals.map((m) => ({ ...m, items: m.items.filter((i) => i.food) })) });
      toast('Dieta salva. O aluno já vê no app.');
      onSaved();
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <Modal title={base ? 'Nova versão da dieta' : 'Nova dieta'} sub="A dieta anterior do aluno é arquivada." onClose={onClose} wide>
      <label className="field">
        <span>Aluno</span>
        <MemberPicker value={member} onChange={setMember} autoFocus />
      </label>
      <div className="grid-3">
        <label className="field">
          <span>Nome</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Meta diária (kcal)</span>
          <input className="input" type="number" value={kcal} onChange={(e) => setKcal(e.target.value)} />
        </label>
        <div className="field">
          <span>Soma das refeições</span>
          <b className="num" style={{ fontSize: 22, color: Math.abs(total - kcal) > kcal * 0.1 ? 'var(--yellow-ink)' : 'var(--green)' }}>
            {total} kcal
          </b>
        </div>
      </div>
      {meals.map((m, mi) => (
        <div key={mi} className="stack" style={{ gap: 6, borderTop: '1px solid var(--rule-soft)', paddingTop: 10 }}>
          <div className="row">
            <input className="input" style={{ width: 220 }} value={m.name} onChange={(e) => setMeals((ms) => ms.map((x, a) => (a === mi ? { ...x, name: e.target.value } : x)))} aria-label="Nome da refeição" />
            <input className="input" style={{ width: 110 }} type="time" value={m.time || ''} onChange={(e) => setMeals((ms) => ms.map((x, a) => (a === mi ? { ...x, time: e.target.value } : x)))} aria-label="Horário" />
            <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={() => setMeals((ms) => ms.filter((_, a) => a !== mi))}>
              Remover refeição
            </button>
          </div>
          {m.items.map((it, ii) => (
            <div className="row wrap" key={ii} style={{ gap: 6 }}>
              <input className="input" style={{ flex: '2 1 160px' }} placeholder="Alimento" value={it.food} onChange={(e) => setItem(mi, ii, 'food', e.target.value)} />
              <input className="input" style={{ flex: '1 1 110px' }} placeholder="Quantidade" value={it.qty} onChange={(e) => setItem(mi, ii, 'qty', e.target.value)} />
              {[
                ['kcal', 'kcal'],
                ['protein_g', 'P g'],
                ['carbs_g', 'C g'],
                ['fat_g', 'G g'],
              ].map(([k, ph]) => (
                <input key={k} className="input" style={{ width: 70 }} type="number" step="0.1" placeholder={ph} value={it[k]} onChange={(e) => setItem(mi, ii, k, e.target.value)} aria-label={ph} />
              ))}
            </div>
          ))}
          <button className="btn sm" style={{ justifySelf: 'start' }} onClick={() => setMeals((ms) => ms.map((x, a) => (a === mi ? { ...x, items: [...x.items, blankItem()] } : x)))}>
            <Icon name="plus" /> Alimento
          </button>
        </div>
      ))}
      <button className="btn sm" style={{ justifySelf: 'start' }} onClick={() => setMeals((ms) => [...ms, { name: 'Lanche', time: '', items: [blankItem()] }])}>
        Adicionar refeição
      </button>
      <label className="field">
        <span>Orientações gerais</span>
        <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {err && <div className="alert red">{err}</div>}
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>
          Voltar
        </button>
        <button className="btn primary" onClick={save} disabled={!member}>
          Salvar dieta
        </button>
      </div>
    </Modal>
  );
}

export default function Diets() {
  const [params, setParams] = useSearchParams();
  const { data, error, reload } = useData('/training/diets');
  const [view, setView] = useState(null);
  const [edit, setEdit] = useState(null);
  const canEdit = ['dono', 'professor'].includes(getSession().user.role);
  useEffect(() => {
    if (params.get('id')) get(`/training/diets/${params.get('id')}`).then(setView);
  }, [params]);
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Loading />;
  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Dietas</h1>
          <p>{data.length} planos alimentares ativos.</p>
        </div>
        {canEdit && (
          <button className="btn primary" onClick={() => setEdit({})}>
            <Icon name="plus" /> Nova dieta
          </button>
        )}
      </div>
      <section className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Aluno</th>
                <th>Plano</th>
                <th className="right">Meta</th>
                <th className="right hide-sm">Prot / Carb / Gord (g)</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.id} className="click" onClick={() => get(`/training/diets/${d.id}`).then(setView)}>
                  <td>
                    <Link to={`/painel/alunos/${d.member_id}`} onClick={(e) => e.stopPropagation()}>
                      {d.member_name}
                    </Link>
                  </td>
                  <td>{d.name}</td>
                  <td className="right tnum">{d.kcal_target} kcal</td>
                  <td className="right tnum hide-sm">
                    {d.totals.protein_g} / {d.totals.carbs_g} / {d.totals.fat_g}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {view && (
        <Modal title={view.member?.name} sub={`${view.name}, ${view.totals.kcal} kcal de ${view.kcal_target}`} onClose={() => (setView(null), setParams({}))} wide>
          {view.meals.map((m) => (
            <div key={m.id}>
              <b>
                {m.time} {m.name}
              </b>
              {m.items.map((i) => (
                <div key={i.id} className="food">
                  <span>
                    {i.food} <span className="muted">{i.qty}</span>
                  </span>
                  <span className="tnum muted">{i.kcal} kcal</span>
                </div>
              ))}
            </div>
          ))}
          {view.notes && <p className="muted small">{view.notes}</p>}
          {canEdit && (
            <div className="modal-foot">
              <button className="btn" onClick={() => (setEdit(view), setView(null))}>
                Criar nova versão a partir desta
              </button>
            </div>
          )}
        </Modal>
      )}
      {edit && (
        <Editor
          base={edit.meals ? edit : null}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
