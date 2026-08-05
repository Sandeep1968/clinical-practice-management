import { useEffect, useState } from 'react';
import { Avatar } from '../ui.jsx';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
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

const TABS = ['Visits', 'My Plan', 'Prescriptions', 'Forms', 'Messages', 'Bills', 'Book'];

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
  const [tps, setTps] = useState([]);
  const [ackName, setAckName] = useState('');
  const [docs, setDocs] = useState([]);
  const [signName, setSignName] = useState('');
  const [threads, setThreads] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [payPlans, setPayPlans] = useState([]);
  const [bookForm, setBookForm] = useState({ clinicianId: '', when: '' });
  const [msg, setMsg] = useState('');

  const loadAll = () => {
    papi('/appointments').then(r => setAppts(r?.data || [])).catch(() => {});
    papi('/prescriptions').then(r => setRx(r?.data || [])).catch(() => {});
    papi('/invoices').then(r => setBills(r?.data || [])).catch(() => {});
    papi('/clinicians').then(r => setClinicians(r?.data || [])).catch(() => {});
    papi('/treatment-plans').then(r => setTps(r?.data || [])).catch(() => {});
    papi('/documents').then(r => setDocs(r?.data || [])).catch(() => {});
    papi('/messages').then(r => setThreads(r?.data || [])).catch(() => {});
    papi('/payment-plans').then(r => setPayPlans(r?.data || [])).catch(() => {});
  };

  const signDoc = async (id) => {
    setMsg('');
    try { await papi(`/documents/${id}/sign`, { method: 'POST', body: { name: signName } }); setSignName(''); loadAll(); }
    catch (err) { setMsg(err.message); }
  };

  const sendMessage = async (threadId) => {
    if (!newMsg.trim()) return;
    setMsg('');
    try { await papi('/messages', { method: 'POST', body: { threadId, body: newMsg } }); setNewMsg(''); loadAll(); }
    catch (err) { setMsg(err.message); }
  };

  const acknowledge = async (id) => {
    setMsg('');
    try {
      await papi(`/treatment-plans/${id}/acknowledge`, { method: 'POST', body: { name: ackName } });
      setAckName(''); loadAll();
    } catch (err) { setMsg(err.message); }
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

        {tab === 'My Plan' && (
          <div>
            {tps.map(p => (
              <div className="card" key={p.id}>
                <div className="card-head">
                  <h3>{p.title}</h3>
                  <span className="muted">{p.clinician_name}</span>
                </div>
                {p.presenting_problem && <p className="muted">{p.presenting_problem}</p>}
                <p className="muted">
                  {p.frequency}{p.modality && ` · ${p.modality}`}
                  {p.review_date && ` · next review ${new Date(p.review_date).toLocaleDateString()}`}
                </p>
                {(p.goals || []).map((g, i) => (
                  <div key={i} style={{ padding: '10px 0', borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{g.goal}</div>
                    {(g.objectives || []).map((o, oi) => (
                      <div className="muted" key={oi} style={{ paddingLeft: 12 }}>• {o.text}</div>
                    ))}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                      <span style={{ background: '#eef0f6', borderRadius: 6, height: 8, flex: 1 }}>
                        <span style={{ display: 'block', width: `${g.progress_pct}%`, background: 'var(--accent)', height: 8, borderRadius: 6 }} />
                      </span>
                      <span className="muted">{g.progress_pct}%</span>
                    </div>
                  </div>
                ))}
                {p.client_ack_at ? (
                  <p className="muted" style={{ marginTop: 12 }}>
                    ✓ You acknowledged this plan on {new Date(p.client_ack_at).toLocaleDateString()}.
                  </p>
                ) : (
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                    <p className="muted">Type your full name to acknowledge you've reviewed this plan with your provider.</p>
                    <div className="row" style={{ marginBottom: 0 }}>
                      <input placeholder="Your full name" value={ackName} onChange={e => setAckName(e.target.value)} />
                      <button className="primary" disabled={!ackName.trim()} onClick={() => acknowledge(p.id)}>
                        Sign & acknowledge
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {!tps.length && <div className="card"><p className="muted">No treatment plan has been shared with you yet.</p></div>}
            {msg && <p className="muted">{msg}</p>}
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

        {tab === 'Forms' && (
          <div>
            {docs.map(d => (
              <div className="card" key={d.id}>
                <div className="card-head">
                  <h3>{d.title}</h3>
                  <span className={`badge ${d.status === 'signed' ? 'funded' : d.status === 'pending_signature' ? 'in_revision' : 'draft'}`}>
                    {d.status.replaceAll('_', ' ')}
                  </span>
                </div>
                {d.body && <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{d.body}</p>}
                {d.status === 'pending_signature' ? (
                  <div className="row" style={{ marginBottom: 0, marginTop: 12 }}>
                    <input placeholder="Type your full name to sign" value={signName}
                           onChange={e => setSignName(e.target.value)} style={{ flex: 1 }} />
                    <button className="primary" disabled={!signName.trim()} onClick={() => signDoc(d.id)}>
                      Sign electronically
                    </button>
                  </div>
                ) : d.signed_by_client_at && (
                  <p className="muted">✓ Signed {new Date(d.signed_by_client_at).toLocaleDateString()}</p>
                )}
              </div>
            ))}
            {!docs.length && <div className="card"><p className="muted">No forms to review.</p></div>}
          </div>
        )}

        {tab === 'Messages' && (
          <div>
            {threads.map(t => (
              <div className="card" key={t.id}>
                <h3>{t.subject}</h3>
                {(t.messages || []).map((m, i) => (
                  <div key={i} className={`bubble-row ${m.sender_kind}`}>
                    <div className="bubble">
                      {m.body}
                      <div className="bubble-meta">
                        {m.sender_kind === 'staff' ? 'Your clinic' : 'You'} · {new Date(m.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
                <div className="row" style={{ marginTop: 12, marginBottom: 0 }}>
                  <input placeholder="Reply…" value={newMsg} onChange={e => setNewMsg(e.target.value)} style={{ flex: 1 }} />
                  <button className="primary" onClick={() => sendMessage(t.id)}>Send</button>
                </div>
              </div>
            ))}
            <div className="card">
              <h3>New message to your clinic</h3>
              <div className="row" style={{ marginBottom: 0 }}>
                <input placeholder="Type your question…" value={newMsg} onChange={e => setNewMsg(e.target.value)} style={{ flex: 1 }} />
                <button className="primary" onClick={() => sendMessage(null)}>Send</button>
              </div>
              <p className="muted" style={{ marginTop: 10 }}>For emergencies call 911 — messages are not monitored 24/7.</p>
            </div>
          </div>
        )}

        {tab === 'Bills' && (
          <>
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
            </div>
            {payPlans.map(p => (
              <div className="card" key={p.id}>
                <div className="card-head">
                  <h3>Payment plan</h3>
                  <span className="muted">${Number(p.total_amount).toFixed(2)} over {p.installments} {p.cadence} payments</span>
                </div>
                <table>
                  <thead><tr><th>#</th><th>Due</th><th>Amount</th><th>Status</th></tr></thead>
                  <tbody>
                    {p.items.map(i => (
                      <tr key={i.id}>
                        <td>{i.seq}</td>
                        <td>{new Date(i.due_date).toLocaleDateString()}</td>
                        <td>${Number(i.amount).toFixed(2)}</td>
                        <td><span className={`badge ${i.paid_at ? 'funded' : 'draft'}`}>{i.paid_at ? 'paid' : 'upcoming'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </>
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
