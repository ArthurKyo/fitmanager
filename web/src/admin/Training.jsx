import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { get, getSession, post, put } from '../api.js';
import { useData, Loading, ErrorBox, Modal, useToast, Icon } from '../ui/kit.jsx';
import { date, relDays } from '../ui/format.js';
import { MemberPicker } from './Access.jsx';

const DIVS = ['A', 'B', 'C', 'D', 'E'];

function Editor({ initial, memberPreset, onClose, onSaved }) {
  const toast = useToast();
  const { data: exercises } = useData('/training/exercises');
  const [member, setMember] = useState(memberPreset || null);
  const [name, setName] = useState(initial?.name || 'Hipertrofia ABC');
  const [goal, setGoal] = useState(initial?.goal || 'Hipertrofia');
  const [validUntil, setValidUntil] = useState(initial?.valid_until || new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10));
  const [items, setItems] = useState(
    initial?.items?.map((i) => ({ division: i.division, exercise_id: i.exercise_id, sets: i.sets, reps: i.reps, load_kg: i.load_kg ?? '', rest_sec: i.rest_sec, notes: i.notes || '' })) || [{ division: 'A', exercise_id: '', sets: 3, reps: '10-12', load_kg: '', rest_sec: 60, notes: '' }]
  );
  const [err, setErr] = useState('');
  const set = (i, k, v) => setItems((x) => x.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  const byMuscle = (exercises || []).reduce((a, e) => ((a[e.muscle] ||= []).push(e), a), {});
  const usedDivs = [...new Set(items.map((i) => i.division))].sort();

  async function save() {
    setErr('');
    const payload = { name, goal, valid_until: validUntil, items: items.filter((i) => i.exercise_id).map((i) => ({ ...i, exercise_id: Number(i.exercise_id), sets: Number(i.sets), rest_sec: Number(i.rest_sec), load_kg: i.load_kg === '' ? null : Number(i.load_kg) })) };
    try {
      if (initial) await put(`/training/workouts/${initial.id}`, payload);
      else await post('/training/workouts', { ...payload, member_id: member?.id });
      toast(initial ? 'Ficha atualizada' : 'Ficha criada. O aluno já vê no app.');
      onSaved();
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <Modal title={initial ? `Ficha de ${initial.member?.name}` : 'Nova ficha de treino'} sub={initial ? null : 'A ficha anterior do aluno é arquivada automaticamente.'} onClose={onClose} wide>
      {!initial && (
        <label className="field">
          <span>Aluno</span>
          <MemberPicker value={member} onChange={setMember} autoFocus />
        </label>
      )}
      <div className="grid-3">
        <label className="field">
          <span>Nome da ficha</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Objetivo</span>
          <select className="select" value={goal} onChange={(e) => setGoal(e.target.value)}>
            {['Hipertrofia', 'Emagrecimento', 'Condicionamento', 'Força', 'Glúteos e posterior', 'Reabilitação'].map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Trocar a ficha em</span>
          <input className="input" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
        </label>
      </div>
      {usedDivs.map((d) => (
        <div key={d} className="stack" style={{ gap: 8 }}>
          <div className="row">
            <span className="div-letter">{d}</span>
            <b>Treino {d}</b>
          </div>
          {items.map((it, i) =>
            it.division !== d ? null : (
              <div key={i} className="row wrap" style={{ gap: 6 }}>
                <select className="select" style={{ flex: '2 1 220px' }} value={it.exercise_id} onChange={(e) => set(i, 'exercise_id', e.target.value)} aria-label="Exercício">
                  <option value="">Exercício</option>
                  {Object.entries(byMuscle).map(([m, list]) => (
                    <optgroup key={m} label={m}>
                      {list.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <input className="input" style={{ width: 64 }} type="number" min="1" max="10" value={it.sets} onChange={(e) => set(i, 'sets', e.target.value)} aria-label="Séries" title="Séries" />
                <input className="input" style={{ width: 96 }} value={it.reps} onChange={(e) => set(i, 'reps', e.target.value)} aria-label="Repetições" title="Repetições" />
                <input className="input" style={{ width: 76 }} type="number" step="0.5" placeholder="kg" value={it.load_kg} onChange={(e) => set(i, 'load_kg', e.target.value)} aria-label="Carga" />
                <input className="input" style={{ width: 76 }} type="number" step="15" value={it.rest_sec} onChange={(e) => set(i, 'rest_sec', e.target.value)} aria-label="Descanso em segundos" title="Descanso (s)" />
                <button className="btn ghost sm" onClick={() => setItems((x) => x.filter((_, j) => j !== i))} aria-label="Remover exercício">
                  <Icon name="x" />
                </button>
              </div>
            )
          )}
          <button className="btn sm" style={{ justifySelf: 'start' }} onClick={() => setItems((x) => [...x, { division: d, exercise_id: '', sets: 3, reps: '10-12', load_kg: '', rest_sec: 60, notes: '' }])}>
            <Icon name="plus" /> Exercício no {d}
          </button>
        </div>
      ))}
      <div className="row">
        <span className="small muted">Colunas: séries, repetições, carga (kg), descanso (s).</span>
        {usedDivs.length < DIVS.length && (
          <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setItems((x) => [...x, { division: DIVS[usedDivs.length], exercise_id: '', sets: 3, reps: '10-12', load_kg: '', rest_sec: 60, notes: '' }])}>
            Adicionar treino {DIVS[usedDivs.length]}
          </button>
        )}
      </div>
      {err && <div className="alert red">{err}</div>}
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>
          Voltar
        </button>
        <button className="btn primary" onClick={save} disabled={!initial && !member}>
          Salvar ficha
        </button>
      </div>
    </Modal>
  );
}

export default function Training() {
  const [params, setParams] = useSearchParams();
  const { data, error, reload } = useData('/training/workouts');
  const [edit, setEdit] = useState(null);
  const [creating, setCreating] = useState(null);
  const canEdit = ['dono', 'professor'].includes(getSession().user.role);

  useEffect(() => {
    const id = params.get('id');
    if (id) get(`/training/workouts/${id}`).then(setEdit);
    const novo = params.get('novo');
    if (novo) get(`/members/${novo}`).then((m) => setCreating({ id: m.id, name: m.name }));
  }, [params]);

  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Loading />;
  const today = new Date().toISOString().slice(0, 10);
  const expired = data.filter((w) => w.valid_until && w.valid_until < today);

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Treinos</h1>
          <p>
            {data.length} fichas ativas{expired.length ? `, ${expired.length} passaram da data de troca` : ''}.
          </p>
        </div>
        {canEdit && (
          <button className="btn primary" onClick={() => setCreating({})}>
            <Icon name="plus" /> Nova ficha
          </button>
        )}
      </div>
      <section className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Aluno</th>
                <th>Ficha</th>
                <th className="hide-sm">Professor</th>
                <th>Trocar em</th>
                <th className="hide-sm">Último treino registrado</th>
              </tr>
            </thead>
            <tbody>
              {data.map((w) => (
                <tr key={w.id} className="click" onClick={() => get(`/training/workouts/${w.id}`).then(setEdit)}>
                  <td>
                    <Link to={`/painel/alunos/${w.member_id}`} onClick={(e) => e.stopPropagation()}>
                      {w.member_name}
                    </Link>
                  </td>
                  <td>
                    {w.name}
                    <div className="tiny faint">{w.goal}</div>
                  </td>
                  <td className="hide-sm">{w.coach_name}</td>
                  <td>
                    <span className={`tag ${w.valid_until < today ? 'yellow' : ''}`}>{date(w.valid_until)}</span>
                  </td>
                  <td className="hide-sm">{w.last_session ? `${relDays(w.last_session)} (${w.sessions} no total)` : 'ainda não usou no app'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {edit && (
        <Editor
          initial={edit}
          onClose={() => (setEdit(null), setParams({}))}
          onSaved={() => {
            setEdit(null);
            setParams({});
            reload();
          }}
        />
      )}
      {creating && (
        <Editor
          memberPreset={creating.id ? creating : null}
          onClose={() => (setCreating(null), setParams({}))}
          onSaved={() => {
            setCreating(null);
            setParams({});
            reload();
          }}
        />
      )}
      {!canEdit && <p className="small muted">Só professores e o dono editam fichas.</p>}
    </div>
  );
}
