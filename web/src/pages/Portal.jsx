import { useEffect, useState } from 'react';
import { Avatar } from '../ui.jsx';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';
let portalToken = localStorage.getItem('cpm_portal_token');

async function papi(path, opts = {}) {
  const res = await fetch(`${BASE}/portal${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(portalToken ? { Authorization: `Bearer ${portalToken}` } : {})
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (res.status === 401 && path !== '/login') { portalToken = null; localStorage.removeItem('cpm_portal_token'); window.location.reload(); return; }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  return res.json();
}

const TABS = ['Visits', 'Prescriptions', 'Bills', 'Book'];

export default function Portal() {
  const [session, setSession] = useState(() => JSON.parse(localStorage.getItem('cpm_portal_user') || 'null'));
  const [email, setEmail] = useState('jamie@example.com');
  const [dob, setDob] = useState('1990-04-12');
  const [error, setError] = useState('');
  const [tab, setTab] = useState('Visits');
  const [appts, setAppts] = useState([]);
  const [rx, setRx] = useState([]);
  const [bills, setBills] = useState([]);
  const [clinicians, setClinicians] = useState([]);
  const [bookForm, setBookForm] = useState({ clinicianId: '', when: '' });
  const [msg, setMsg] = useState('');

  const loadAll = () => {
    papi('/appointments').then(r => setAppts(r?.data || [])).catch(() => {});
    papi('/prescriptions').then(r => setRx(r?.data || [])).catch(() => {});
    papi('/invoices').then(r => setBills(r?.data || [])).catch(() => {});
    papi('/clinicians').then(r => setClinicians(r?.data || [])).catch(() => {});
  };
  useEffect(() => { if (session && portalToken) loadAll(); }, [session]);

  const login = async (e) => {
    e.preventDefault(); setError('');
    try {
      const r = await papi('/login', { method: 'POST', body: { email, dob } });
      portalToken = r.token;
      localStorage.setItem('cpm_portal_token', r.token);
      localStorage.setItem('cpm_portal_user', JSON.stringify({ name: r.name }));
      setSession({ name: r.name });
    } catch (err) { setError(err.message); }
  };

  const logout = () => {
    portalToken = null;
    localStorage.removeItem('cpm_portal_token');
    localStorage.removeItem('cpm_portal_user');
    setSession(null);
  };

  const book = async (e) => {
    e.preventDefault(); setMsg('');
    try {
      await papi('/book', { method: 'POST', body: { clinicianId: bookForm.clinicianId, startsAt: new Date(bookForm.when).toISOString() } });
      setMsg('Appointment booked. See you then!');
      setBookForm({ clinicianId: '', when: '' });
      loadAll(); setTab('Visits');
    } catch (err) { setMsg(err.message); }
  };

  if (!session) {
    return (
      <div className="login-wrap">
        <form className="card login-card" onSubmit={login}>
          <h2>Patient Portal</h2>
          <p className="muted">Sign in with the email and date of birth on file with your clinic.</p>
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
          <input type="date" value={dob} onChange={e => setDob(e.target.value)} required />
          {error && <p className="error">{error}</p>}
          <button className="primary" style={{ width: '100%' }}>Continue</button>
        </form>
      </div>
    );
  }

  const upcoming = appts.filter(a => new Date(a.starts_at) > new Date() && !['cancelled', 'no_show'].includes(a.status));

  return (
    <div className="portal-wrap">
      <header className="portal-head">
        <div className="portal-brand">Patient Portal</div>
        <div className="topbar-user">
          <Avatar name={session.name} />
          <div style={{ fontWeight: 600, fontSize: 14 }}>{session.name}</div>
          <button onClick={logout} style={{ marginLeft: 10 }}>Sign out</button>
        </div>
      </header>

      <div className="portal-body">
        {upcoming[0] && (
          <div className="card next-visit">
            <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em' }}>Next visit</div>
            <div style={{ fontSize: 20, fontWeight: 700, margin: '4px 0' }}>
              {new Date(upcoming[0].starts_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </div>
            <div className="muted">with {upcoming[0].clinician_name} · {upcoming[0].location}</div>
          </div>
        )}

        <div className="tabs">
          {TABS.map(t => <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
        </div>

        {tab === 'Visits' && (
          <div className="card">
            <div className="people-list">
              {appts.map(a => (
                <div className="person-row" key={a.id}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{new Date(a.starts_at).toLocaleString()}</div>
                    <div className="muted">{a.clinician_name} · {a.appt_type} · {a.location}</div>
                  </div>
                  <span className={`badge ${a.status}`}>{a.status.replaceAll('_', ' ')}</span>
                </div>
              ))}
              {!appts.length && <p className="muted">No visits yet.</p>}
            </div>
          </div>
        )}

        {tab === 'Prescriptions' && (
          <div>
            {rx.map(p => (
              <div className="card" key={p.id}>
                <div className="card-head">
                  <h3>{new Date(p.created_at).toLocaleDateString()}</h3>
                  <span className="muted">{p.clinician_name}</span>
                </div>
                {(p.medications || []).map((m, i) => (
                  <div className="person-row" key={i}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{m.name} {m.strength}</div>
                      <div className="muted">{m.frequency} · {m.duration} · {m.instructions}</div>
                    </div>
                  </div>
                ))}
                {p.advice && <p className="muted" style={{ marginTop: 8 }}>Advice: {p.advice}</p>}
              </div>
            ))}
            {!rx.length && <div className="card"><p className="muted">No prescriptions yet.</p></div>}
          </div>
        )}

        {tab === 'Bills' && (
          <div className="card">
            <table>
              <thead><tr><th>Date</th><th>Amount</th><th>Balance</th><th>Status</th></tr></thead>
              <tbody>
                {bills.map(b => (
                  <tr key={b.id}>
                    <td>{new Date(b.created_at).toLocaleDateString()}</td>
                    <td>${Number(b.amount).toFixed(2)}</td>
                    <td>${Number(b.balance).toFixed(2)}</td>
                    <td><span className={`badge ${b.status === 'paid' ? 'funded' : 'in_revision'}`}>{b.status}</span></td>
                  </tr>
                ))}
                {!bills.length && <tr><td colSpan="4" className="muted">No bills. 🎉</td></tr>}
              </tbody>
            </table>
            <p className="muted" style={{ marginTop: 10 }}>Online payment coming soon — contact the clinic to pay a balance.</p>
          </div>
        )}

        {tab === 'Book' && (
          <div className="card">
            <h3>Book an appointment</h3>
            <form onSubmit={book}>
              <div className="row">
                <select value={bookForm.clinicianId} required
                        onChange={e => setBookForm({ ...bookForm, clinicianId: e.target.value })}>
                  <option value="">Choose provider…</option>
                  {clinicians.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                </select>
                <input type="datetime-local" value={bookForm.when} required
                       onChange={e => setBookForm({ ...bookForm, when: e.target.value })} />
                <button className="primary">Book</button>
              </div>
            </form>
            {msg && <p className="muted">{msg}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
