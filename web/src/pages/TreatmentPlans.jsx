import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { Avatar } from '../ui.jsx';

const emptyGoal = () => ({ goal: '', interventions: '', targetDate: '', objectives: [{ text: '', measure: '' }] });
const GOAL_STATUS = ['not_started', 'in_progress', 'met', 'partially_met', 'discontinued'];
const badgeFor = (s) => ({
  met: 'funded', in_progress: 'submitted', partially_met: 'in_revision',
  discontinued: 'denied', not_started: 'draft'
}[s] || 'draft');

function ProgressBar({ pct }) {
  return (
    <div style={{ background: '#eef0f6', borderRadius: 6, height: 8, minWidth: 90, flex: 1 }}>
      <div style={{ width: `${pct}%`, background: 'var(--accent)', height: 8, borderRadius: 6 }} />
    </div>
  );
}

export default function TreatmentPlans() {
  const [params] = useSearchParams();
  const [plans, setPlans] = useState([]);
  const [clients, setClients] = useState([]);
  const [open, setOpen] = useState(null);       // full plan being viewed
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({
    clientId: params.get('client') || '', title: 'Treatment Plan', presentingProblem: '',
    diagnoses: [{ code: '', label: '' }], frequency: 'Weekly, 50-minute sessions',
    modality: '', reviewDate: '', goals: [emptyGoal()]
  });

  const load = () => api('/treatment-plans').then(r => setPlans(r?.data || [])).catch(() => {});
  useEffect(() => {
    load();
    api('/clients').then(r => setClients(r?.data || [])).catch(() => {});
    if (params.get('plan')) view(params.get('plan'));
  }, []);

  const view = async (id) => { setOpen(await api(`/treatment-plans/${id}`)); setCreating(false); };

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setGoal = (i, k, v) => setForm(f => ({ ...f, goals: f.goals.map((g, j) => j === i ? { ...g, [k]: v } : g) }));
  const setObj = (gi, oi, k, v) => setForm(f => ({
    ...f, goals: f.goals.map((g, j) => j === gi
      ? { ...g, objectives: g.objectives.map((o, k2) => k2 === oi ? { ...o, [k]: v } : o) } : g)
  }));

  const create = async (e) => {
    e.preventDefault(); setMsg('');
    try {
      const plan = await api('/treatment-plans', {
        method: 'POST',
        body: { ...form, diagnoses: form.diagnoses.filter(d => d.label.trim()),
                goals: form.goals.filter(g => g.goal.trim())
                  .map(g => ({ ...g, objectives: g.objectives.filter(o => o.text.trim()) })) }
      });
      setCreating(false); setOpen(plan); load();
    } catch (err) { setMsg(err.message); }
  };

  const sign = async () => {
    try { setOpen(await api(`/treatment-plans/${open.id}/sign`, { method: 'POST' })); load(); }
    catch (err) { setMsg(err.message); }
  };

  const revise = async () => {
    const p = await api(`/treatment-plans/${open.id}/revise`, { method: 'POST' });
    setOpen(p); load();
  };

  const updateGoal = async (goalId, patch) => {
    await api(`/treatment-plans/goals/${goalId}`, { method: 'PATCH', body: patch });
    view(open.id); load();
  };

  // ---------- detail view ----------
  if (open) {
    const avg = open.goals.length
      ? Math.round(open.goals.reduce((s, g) => s + g.progress_pct, 0) / open.goals.length) : 0;
    return (
      <>
        <div className="row">
          <button onClick={() => setOpen(null)}>← All plans</button>
          {!open.locked && <button className="primary" onClick={sign}>Sign & activate</button>}
          {open.locked && <button onClick={revise}>Revise (new version)</button>}
        </div>
        {msg && <p className="error">{msg}</p>}

        <div className="chart-head card">
          <Avatar name={open.client_name} size={52} />
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0 }}>{open.title}</h2>
            <div className="muted">
              {open.client_name} · v{open.version} · {open.clinician_name}
              {open.signed_at
                ? ` · signed ${new Date(open.signed_at).toLocaleDateString()}`
                : ' · unsigned draft'}
              {open.client_ack_at && ` · patient acknowledged ${new Date(open.client_ack_at).toLocaleDateString()}`}
            </div>
          </div>
          <span className={`badge ${open.status === 'active' ? 'funded' : open.status === 'draft' ? 'draft' : 'submitted'}`}>
            {open.status}
          </span>
        </div>

        <div className="card">
          <div className="card-head"><h3>Overall progress</h3><b>{avg}%</b></div>
          <ProgressBar pct={avg} />
          <div className="row" style={{ marginTop: 14, marginBottom: 0 }}>
            <span className="muted">Frequency: {open.frequency || '—'}</span>
            <span className="muted">· Modality: {open.modality || '—'}</span>
            {open.review_date && <span className="muted">· Review by {new Date(open.review_date).toLocaleDateString()}</span>}
          </div>
        </div>

        {open.presenting_problem && (
          <div className="card">
            <h3>Presenting problem</h3>
            <p style={{ margin: 0 }}>{open.presenting_problem}</p>
            {(open.diagnoses || []).length > 0 && (
              <p className="muted" style={{ marginTop: 10 }}>
                Diagnoses: {open.diagnoses.map(d => `${d.label}${d.code ? ` (${d.code})` : ''}`).join(', ')}
              </p>
            )}
          </div>
        )}

        {open.goals.map(g => (
          <div className="card" key={g.id}>
            <div className="card-head">
              <h3>Goal {g.seq}: {g.goal}</h3>
              <span className={`badge ${badgeFor(g.status)}`}>{g.status.replaceAll('_', ' ')}</span>
            </div>
            {(g.objectives || []).length > 0 && (
              <ul style={{ paddingLeft: 18, margin: '0 0 12px' }}>
                {g.objectives.map((o, i) => (
                  <li key={i} style={{ padding: '3px 0' }}>
                    {o.text}{o.measure && <span className="muted"> — {o.measure}</span>}
                  </li>
                ))}
              </ul>
            )}
            {g.interventions && <p className="muted" style={{ marginTop: 0 }}>Interventions: {g.interventions}</p>}
            <div className="row" style={{ marginBottom: 0, alignItems: 'center' }}>
              <ProgressBar pct={g.progress_pct} />
              <b style={{ width: 44 }}>{g.progress_pct}%</b>
              <input type="range" min="0" max="100" step="10" defaultValue={g.progress_pct}
                     onMouseUp={e => updateGoal(g.id, { progressPct: +e.target.value })}
                     onTouchEnd={e => updateGoal(g.id, { progressPct: +e.target.value })}
                     style={{ width: 150, padding: 0 }} />
              <select value={g.status} onChange={e => updateGoal(g.id, { status: e.target.value })}>
                {GOAL_STATUS.map(s => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}
              </select>
              {g.target_date && <span className="muted">target {new Date(g.target_date).toLocaleDateString()}</span>}
            </div>
          </div>
        ))}
      </>
    );
  }

  // ---------- create form ----------
  if (creating) {
    return (
      <>
        <div className="row"><button onClick={() => setCreating(false)}>← Cancel</button></div>
        <form className="card" onSubmit={create}>
          <h3>New treatment plan</h3>
          <div className="row">
            <select value={form.clientId} onChange={e => setF('clientId', e.target.value)} required>
              <option value="">Select patient…</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.last_name}, {c.first_name}</option>)}
            </select>
            <input value={form.title} onChange={e => setF('title', e.target.value)} placeholder="Plan title" style={{ flex: 1 }} />
          </div>

          <label className="muted">Presenting problem</label>
          <textarea rows={3} value={form.presentingProblem} onChange={e => setF('presentingProblem', e.target.value)}
                    style={{ width: '100%', marginBottom: 12 }} placeholder="Client reports…" />

          <div className="row">
            <input placeholder="ICD-10" value={form.diagnoses[0].code}
                   onChange={e => setF('diagnoses', [{ ...form.diagnoses[0], code: e.target.value }])} style={{ width: 130 }} />
            <input placeholder="Diagnosis" value={form.diagnoses[0].label}
                   onChange={e => setF('diagnoses', [{ ...form.diagnoses[0], label: e.target.value }])} style={{ flex: 1 }} />
          </div>
          <div className="row">
            <input placeholder="Frequency" value={form.frequency} onChange={e => setF('frequency', e.target.value)} style={{ flex: 1 }} />
            <input placeholder="Modality (e.g. CBT)" value={form.modality} onChange={e => setF('modality', e.target.value)} style={{ flex: 1 }} />
            <input type="date" value={form.reviewDate} onChange={e => setF('reviewDate', e.target.value)} title="Review date" />
          </div>

          <h3 style={{ marginTop: 18 }}>Goals & objectives</h3>
          {form.goals.map((g, i) => (
            <div className="card" key={i} style={{ background: 'var(--bg)' }}>
              <input placeholder={`Goal ${i + 1} — long-term outcome`} value={g.goal}
                     onChange={e => setGoal(i, 'goal', e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
              {g.objectives.map((o, oi) => (
                <div className="row" key={oi}>
                  <input placeholder="Objective (measurable)" value={o.text}
                         onChange={e => setObj(i, oi, 'text', e.target.value)} style={{ flex: 2 }} />
                  <input placeholder="How measured" value={o.measure}
                         onChange={e => setObj(i, oi, 'measure', e.target.value)} style={{ flex: 1 }} />
                </div>
              ))}
              <div className="row">
                <button type="button" onClick={() => setGoal(i, 'objectives', [...g.objectives, { text: '', measure: '' }])}>
                  + objective
                </button>
                <input placeholder="Interventions" value={g.interventions}
                       onChange={e => setGoal(i, 'interventions', e.target.value)} style={{ flex: 1 }} />
                <input type="date" value={g.targetDate} onChange={e => setGoal(i, 'targetDate', e.target.value)} title="Target date" />
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setF('goals', [...form.goals, emptyGoal()])}>+ goal</button>

          {msg && <p className="error">{msg}</p>}
          <div className="row" style={{ marginTop: 14, marginBottom: 0 }}>
            <button className="primary" disabled={!form.clientId || !form.goals.some(g => g.goal.trim())}>
              Create plan
            </button>
          </div>
        </form>
      </>
    );
  }

  // ---------- list ----------
  return (
    <>
      <div className="hero">
        <h2 style={{ margin: 0 }}>Treatment Plans</h2>
        <button className="primary" onClick={() => setCreating(true)}>+ New plan</button>
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Patient</th><th>Plan</th><th>Progress</th><th>Review due</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {plans.map(p => (
              <tr key={p.id}>
                <td>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar name={p.client_name} size={30} /><b>{p.client_name}</b>
                  </span>
                </td>
                <td>{p.title}</td>
                <td>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ProgressBar pct={p.avg_progress} /><span className="muted">{p.avg_progress}%</span>
                  </span>
                </td>
                <td className="muted">{p.review_date ? new Date(p.review_date).toLocaleDateString() : '—'}</td>
                <td><span className={`badge ${p.signed_at ? 'funded' : 'draft'}`}>{p.signed_at ? 'active' : 'draft'}</span></td>
                <td><button onClick={() => view(p.id)}>open</button></td>
              </tr>
            ))}
            {!plans.length && <tr><td colSpan="6" className="muted">No treatment plans yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
