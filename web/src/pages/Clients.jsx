import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { Avatar } from '../ui.jsx';

export default function Clients({ user }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [clients, setClients] = useState([]);
  const [q, setQ] = useState(params.get('q') || '');
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', smsConsent: false });
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
  useEffect(() => { load(); }, [params]);

  const create = async (e) => {
    e.preventDefault();
    await api('/clients', { method: 'POST', body: form });
    setForm({ firstName: '', lastName: '', email: '', phone: '', smsConsent: false });
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
          <input placeholder="Mobile phone" type="tel" value={form.phone}
                 onChange={e => setForm({ ...form, phone: e.target.value })} style={{ width: 150 }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={form.smsConsent}
                   onChange={e => setForm({ ...form, smsConsent: e.target.checked })} />
            Consents to SMS reminders
          </label>
          <button className="primary">Add patient</button>
        </form>
      )}
      <div className="card">
        <table>
          <thead><tr><th>Name</th><th>DOB</th><th>Email</th><th>Status</th><th>Insurance</th></tr></thead>
          <tbody>
            {clients.map(c => {
              const e = elig[c.id];
              return (
                <tr key={c.id} style={{ cursor: 'pointer' }}>
                  <td onClick={() => navigate(`/patients/${c.id}`)}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar name={`${c.first_name} ${c.last_name}`} size={32} />
                      <b>{c.last_name}, {c.first_name}</b>
                    </span>
                  </td>
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
