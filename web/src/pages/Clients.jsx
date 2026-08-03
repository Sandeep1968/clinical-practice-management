import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Clients({ user }) {
  const [clients, setClients] = useState([]);
  const [q, setQ] = useState('');
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '' });
  const [elig, setElig] = useState({});   // clientId -> result
  const canCreate = ['owner', 'admin', 'front_desk'].includes(user.role);

  const verify = async (clientId) => {
    setElig(e => ({ ...e, [clientId]: { loading: true } }));
    try {
      const r = await api('/eligibility/check', { method: 'POST', body: { clientId } });
      setElig(e => ({ ...e, [clientId]: r }));
    } catch (err) {
      setElig(e => ({ ...e, [clientId]: { error: err.message } }));
    }
  };

  const load = () => api(`/clients${q ? `?q=${encodeURIComponent(q)}` : ''}`)
    .then(r => setClients(r?.data || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    await api('/clients', { method: 'POST', body: form });
    setForm({ firstName: '', lastName: '', email: '' });
    load();
  };

  return (
    <>
      <h2>Clients {user.role === 'clinician' && <small style={{ color: '#667085' }}>(your caseload)</small>}</h2>
      <div className="row">
        <input placeholder="Search name…" value={q} onChange={e => setQ(e.target.value)} />
        <button className="primary" onClick={load}>Search</button>
      </div>
      {canCreate && (
        <form className="card row" onSubmit={create}>
          <input placeholder="First name" value={form.firstName} required
                 onChange={e => setForm({ ...form, firstName: e.target.value })} />
          <input placeholder="Last name" value={form.lastName} required
                 onChange={e => setForm({ ...form, lastName: e.target.value })} />
          <input placeholder="Email" type="email" value={form.email}
                 onChange={e => setForm({ ...form, email: e.target.value })} />
          <button className="primary">Add client</button>
        </form>
      )}
      <div className="card">
        <table>
          <thead><tr><th>Name</th><th>DOB</th><th>Email</th><th>Status</th><th>Insurance</th></tr></thead>
          <tbody>
            {clients.map(c => {
              const e = elig[c.id];
              return (
                <tr key={c.id}>
                  <td>{c.last_name}, {c.first_name}</td>
                  <td>{c.dob ? new Date(c.dob).toLocaleDateString() : '—'}</td>
                  <td>{c.email || '—'}</td>
                  <td>{c.status}</td>
                  <td>
                    {!e && <button onClick={() => verify(c.id)}>Verify eligibility</button>}
                    {e?.loading && 'Checking…'}
                    {e?.error && <span className="error">{e.error}</span>}
                    {e?.status === 'verified' &&
                      <span className="badge funded">copay ${Number(e.copay).toFixed(0)} · deductible ${Number(e.deductibleRemaining).toFixed(0)} left</span>}
                    {e?.status === 'failed' && <span className="badge denied">coverage inactive</span>}
                  </td>
                </tr>
              );
            })}
            {!clients.length && <tr><td colSpan="5">No clients visible. (Clinicians only see assigned clients.)</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
