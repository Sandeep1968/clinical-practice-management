import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Clients({ user }) {
  const [clients, setClients] = useState([]);
  const [q, setQ] = useState('');
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '' });
  const canCreate = ['owner', 'admin', 'front_desk'].includes(user.role);

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
          <thead><tr><th>Name</th><th>DOB</th><th>Email</th><th>Status</th></tr></thead>
          <tbody>
            {clients.map(c => (
              <tr key={c.id}>
                <td>{c.last_name}, {c.first_name}</td>
                <td>{c.dob ? new Date(c.dob).toLocaleDateString() : '—'}</td>
                <td>{c.email || '—'}</td>
                <td>{c.status}</td>
              </tr>
            ))}
            {!clients.length && <tr><td colSpan="4">No clients visible. (Clinicians only see assigned clients.)</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
