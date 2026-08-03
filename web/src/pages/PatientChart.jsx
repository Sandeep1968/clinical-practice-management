import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Avatar } from '../ui.jsx';

const TABS = ['Overview', 'Treatment Plans', 'Prescriptions', 'Appointments'];

export default function PatientChart({ user }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [tab, setTab] = useState('Overview');
  const [rx, setRx] = useState([]);
  const [appts, setAppts] = useState([]);
  const [elig, setElig] = useState(null);
  const [checking, setChecking] = useState(false);
  const [tps, setTps] = useState([]);

  useEffect(() => {
    api(`/clients/${id}`).then(setClient).catch(() => {});
    api(`/prescriptions/client/${id}`).then(r => setRx(r?.data || [])).catch(() => {});
    const from = new Date(Date.now() - 365 * 864e5), to = new Date(Date.now() + 90 * 864e5);
    api(`/appointments?from=${from.toISOString()}&to=${to.toISOString()}`)
      .then(r => setAppts((r?.data || []).filter(a => a.client_id === id))).catch(() => {});
    api(`/eligibility/client/${id}`).then(setElig).catch(() => {});
    api(`/treatment-plans/client/${id}`).then(r => setTps(r?.data || [])).catch(() => {});
  }, [id]);

  const verify = async () => {
    setChecking(true);
    try { setElig(await api('/eligibility/check', { method: 'POST', body: { clientId: id } })); }
    catch (e) { setElig({ error: e.message }); }
    setChecking(false);
  };

  if (!client) return <p className="muted">Loading…</p>;
  const name = `${client.first_name} ${client.last_name}`;
  const age = client.dob ? Math.floor((Date.now() - new Date(client.dob)) / (365.25 * 864e5)) : null;

  return (
    <>
      <div className="chart-head card">
        <Avatar name={name} size={56} />
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0 }}>{name}</h2>
          <div className="muted">
            {age !== null && `${age} yrs · `}{client.dob && `DOB ${new Date(client.dob).toLocaleDateString()} · `}
            {client.phone || 'no phone'} · {client.email || 'no email'}
          </div>
        </div>
        {user.role === 'clinician' && (
          <button className="primary" onClick={() => navigate(`/prescriptions?client=${id}`)}>+ New Rx</button>
        )}
      </div>

      <div className="tabs">
        {TABS.map(t => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === 'Overview' && (
        <>
          <div className="card">
            <div className="card-head"><h3>Insurance & eligibility</h3>
              <button onClick={verify} disabled={checking}>{checking ? 'Checking…' : 'Verify now'}</button>
            </div>
            {!elig && <p className="muted">No eligibility checks on file.</p>}
            {elig?.error && <p className="error">{elig.error}</p>}
            {elig && !elig.error && (
              <div className="people-list">
                <div className="person-row">
                  <span className={`badge ${elig.status === 'verified' ? 'funded' : 'denied'}`}>{elig.status}</span>
                  <div className="muted">
                    Copay ${Number(elig.copay ?? 0).toFixed(0)} · Deductible remaining ${Number(elig.deductible_remaining ?? elig.deductibleRemaining ?? 0).toFixed(0)}
                    {elig.checked_at && ` · checked ${new Date(elig.checked_at).toLocaleDateString()}`}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="card">
            <h3>Recent activity</h3>
            <div className="people-list">
              {[...appts].slice(0, 5).map(a => (
                <div className="person-row" key={a.id}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{new Date(a.starts_at).toLocaleDateString()}</div>
                    <div className="muted">{a.appt_type} · {a.location}</div>
                  </div>
                  <span className={`badge ${a.status}`}>{a.status.replaceAll('_', ' ')}</span>
                </div>
              ))}
              {!appts.length && <p className="muted">No visits yet.</p>}
            </div>
          </div>
        </>
      )}

      {tab === 'Treatment Plans' && (
        <div className="card">
          <div className="card-head">
            <h3>Treatment plans</h3>
            {user.role === 'clinician' &&
              <button onClick={() => navigate(`/treatment-plans?client=${id}`)}>+ New plan</button>}
          </div>
          <table>
            <thead><tr><th>Plan</th><th>Version</th><th>Goals</th><th>Progress</th><th>Review</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {tps.map(t => (
                <tr key={t.id}>
                  <td><b>{t.title}</b><div className="muted">{t.clinician_name}</div></td>
                  <td>v{t.version}</td>
                  <td>{t.goal_count}</td>
                  <td>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ background: '#eef0f6', borderRadius: 6, height: 8, width: 80 }}>
                        <span style={{ display: 'block', width: `${t.avg_progress}%`, background: 'var(--accent)', height: 8, borderRadius: 6 }} />
                      </span>
                      <span className="muted">{t.avg_progress}%</span>
                    </span>
                  </td>
                  <td className="muted">{t.review_date ? new Date(t.review_date).toLocaleDateString() : '—'}</td>
                  <td>
                    <span className={`badge ${t.status === 'active' ? 'funded' : t.status === 'draft' ? 'draft' : 'submitted'}`}>{t.status}</span>
                    {t.client_ack_at && <div className="muted">pt. acknowledged</div>}
                  </td>
                  <td>
                    {user.role === 'clinician' &&
                      <button onClick={() => navigate(`/treatment-plans?plan=${t.id}`)}>open</button>}
                  </td>
                </tr>
              ))}
              {!tps.length && <tr><td colSpan="7" className="muted">No treatment plans on file.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'Prescriptions' && (
        <div className="card">
          <table>
            <thead><tr><th>Date</th><th>Medications</th><th>Diagnoses</th><th>By</th></tr></thead>
            <tbody>
              {rx.map(p => (
                <tr key={p.id}>
                  <td>{new Date(p.created_at).toLocaleDateString()}</td>
                  <td>{(p.medications || []).map(m => m.name).join(', ')}</td>
                  <td className="muted">{(p.diagnoses || []).map(d => d.label).join(', ') || '—'}</td>
                  <td>{p.clinician_name}</td>
                </tr>
              ))}
              {!rx.length && <tr><td colSpan="4" className="muted">No prescriptions.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'Appointments' && (
        <div className="card">
          <table>
            <thead><tr><th>Date & time</th><th>Type</th><th>Location</th><th>Status</th></tr></thead>
            <tbody>
              {appts.map(a => (
                <tr key={a.id}>
                  <td>{new Date(a.starts_at).toLocaleString()}</td>
                  <td>{a.appt_type}</td>
                  <td>{a.location}</td>
                  <td><span className={`badge ${a.status}`}>{a.status.replaceAll('_', ' ')}</span></td>
                </tr>
              ))}
              {!appts.length && <tr><td colSpan="4" className="muted">No appointments.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
