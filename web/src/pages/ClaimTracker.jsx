import { useEffect, useState } from 'react';
import { api } from '../api.js';

const STATUSES = ['', 'draft', 'submitted', 'in_revision', 'pending_patient_liability', 'funded', 'denied'];
const TRANSITIONS = {
  draft: ['submitted'],
  submitted: ['in_revision', 'pending_patient_liability', 'funded', 'denied'],
  in_revision: ['submitted'],
  pending_patient_liability: ['funded'],
  denied: ['in_revision'],
  funded: []
};

export default function ClaimTracker() {
  const [claims, setClaims] = useState([]);
  const [filter, setFilter] = useState('');
  const [history, setHistory] = useState(null);

  const load = () => api(`/claims${filter ? `?status=${filter}` : ''}`)
    .then(r => setClaims(r?.data || [])).catch(() => {});
  useEffect(() => { load(); }, [filter]);

  const transition = async (id, status) => {
    await api(`/claims/${id}/status`, { method: 'PATCH', body: { status } });
    load();
  };

  const showHistory = async (id) => {
    const r = await api(`/claims/${id}/history`);
    setHistory({ id, events: r?.data || [] });
  };

  return (
    <>
      <h2>Claim Tracker</h2>
      <div className="row">
        <select value={filter} onChange={e => setFilter(e.target.value)}>
          {STATUSES.map(s => <option key={s} value={s}>{s ? s.replaceAll('_', ' ') : 'All statuses'}</option>)}
        </select>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Client</th><th>Claim #</th><th>Provider</th><th>DOS</th>
              <th>Rate</th><th>Payout Date</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {claims.map(c => (
              <tr key={c.id}>
                <td>{c.client_name}</td>
                <td>{c.claim_number || '—'}</td>
                <td>{c.provider_name}</td>
                <td>{new Date(c.dos).toLocaleDateString()}</td>
                <td>${Number(c.rate).toFixed(2)}</td>
                <td>{c.funded_at
                  ? new Date(c.funded_at).toLocaleDateString()
                  : c.expected_payout_date ? `est. ${new Date(c.expected_payout_date).toLocaleDateString()}` : '—'}</td>
                <td><span className={`badge ${c.status}`}>{c.status.replaceAll('_', ' ')}</span></td>
                <td>
                  {(TRANSITIONS[c.status] || []).map(s => (
                    <button key={s} onClick={() => transition(c.id, s)} style={{ marginRight: 6 }}>
                      → {s.replaceAll('_', ' ')}
                    </button>
                  ))}
                  <button onClick={() => showHistory(c.id)}>history</button>
                </td>
              </tr>
            ))}
            {!claims.length && <tr><td colSpan="8">No claims match this filter.</td></tr>}
          </tbody>
        </table>
      </div>
      {history && (
        <div className="card">
          <h3>Status history</h3>
          <table>
            <thead><tr><th>From</th><th>To</th><th>Source</th><th>At</th></tr></thead>
            <tbody>
              {history.events.map((e, i) => (
                <tr key={i}>
                  <td>{e.from_status || '—'}</td>
                  <td>{e.to_status}</td>
                  <td>{e.source}</td>
                  <td>{new Date(e.at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={() => setHistory(null)} style={{ marginTop: 10 }}>Close</button>
        </div>
      )}
    </>
  );
}
