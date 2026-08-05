import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../ui.jsx';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
let ptoken = localStorage.getItem('cpm_platform_token');

async function padmin(path, opts = {}) {
  const res = await fetch(`${BASE}/platform${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(ptoken ? { Authorization: `Bearer ${ptoken}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (res.status === 401 && path !== '/login') {
    ptoken = null; localStorage.removeItem('cpm_platform_token');
    localStorage.removeItem('cpm_platform_user'); window.location.reload(); return;
  }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  return res.json();
}

const TABS = ['Practices', 'Plans', 'Platform Analytics'];

export default function Platform() {
  const [session, setSession] = useState(() => JSON.parse(localStorage.getItem('cpm_platform_user') || 'null'));
  const [email, setEmail] = useState('admin@clinicos.app');
  const [password, setPassword] = useState('Demo1234!');
  const [error, setError] = useState('');
  const [tab, setTab] = useState('Practices');
  const [metrics, setMetrics] = useState(null);
  const [practices, setPractices] = useState([]);
  const [plans, setPlans] = useState([]);

  const load = () => {
    padmin('/metrics').then(setMetrics).catch(() => {});
    padmin('/practices').then(r => setPractices(r?.data || [])).catch(() => {});
    padmin('/plans').then(r => setPlans(r?.data || [])).catch(() => {});
  };
  useEffect(() => { if (session && ptoken) load(); }, [session]);

  const login = async (e) => {
    e.preventDefault(); setError('');
    try {
      const r = await padmin('/login', { method: 'POST', body: { email, password } });
      ptoken = r.token;
      localStorage.setItem('cpm_platform_token', r.token);
      localStorage.setItem('cpm_platform_user', JSON.stringify({ name: r.name }));
      setSession({ name: r.name });
    } catch (err) { setError(err.message); }
  };

  const logout = () => {
    ptoken = null;
    localStorage.removeItem('cpm_platform_token');
    localStorage.removeItem('cpm_platform_user');
    setSession(null);
  };

  const toggleStatus = async (p) => {
    await padmin(`/practices/${p.tenant_id}/status`, {
      method: 'PATCH', body: { status: p.status === 'active' ? 'suspended' : 'active' }
    });
    load();
  };

  const changePlan = async (p, code) => {
    await padmin(`/practices/${p.tenant_id}/plan`, { method: 'PATCH', body: { plan: code, seats: p.seats || 1 } });
    load();
  };

  if (!session) {
    return (
      <div className="login-wrap">
        <form className="card login-card" onSubmit={login}>
          <h2>Platform Console</h2>
          <p className="muted">Super-admin access across all practices.</p>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          {error && <p className="error">{error}</p>}
          <button className="primary" style={{ width: '100%' }}>Sign in</button>
          <p className="muted" style={{ textAlign: 'center', marginTop: 12 }}>
            <Link to="/">← Back to site</Link>
          </p>
        </form>
      </div>
    );
  }

  return (
    <div className="portal-wrap">
      <header className="portal-head">
        <div className="portal-brand">＋ ClinicOS · Platform</div>
        <div className="topbar-user">
          <Avatar name={session.name} />
          <div style={{ fontWeight: 600, fontSize: 14 }}>{session.name}</div>
          <button onClick={logout} style={{ marginLeft: 10 }}>Sign out</button>
        </div>
      </header>

      <div className="platform-body">
        {metrics && (
          <div className="stat-grid">
            <div className="stat grad-purple"><div className="num">{metrics.practices}</div><div className="label">Practices</div></div>
            <div className="stat grad-green"><div className="num">${Number(metrics.mrr).toLocaleString()}</div><div className="label">MRR</div></div>
            <div className="stat grad-amber"><div className="num">{metrics.clinicians}</div><div className="label">Clinicians</div></div>
            <div className="stat"><div className="num">{metrics.patients}</div><div className="label">Patients</div></div>
            <div className="stat"><div className="num">{metrics.appointments_30d}</div><div className="label">Appointments (30d)</div></div>
          </div>
        )}

        <div className="tabs">
          {TABS.map(t => <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
        </div>

        {tab === 'Practices' && (
          <div className="card">
            <table>
              <thead>
                <tr><th>Practice</th><th>Address</th><th>Plan</th><th>Clinicians</th><th>Patients</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {practices.map(p => (
                  <tr key={p.tenant_id}>
                    <td><b>{p.name}</b><div className="muted">joined {new Date(p.created_at).toLocaleDateString()}</div></td>
                    <td className="muted">{p.subdomain}.clinicos.app</td>
                    <td>
                      <select value={plans.find(x => x.name === p.plan_name)?.code || ''}
                              onChange={e => changePlan(p, e.target.value)}>
                        <option value="">—</option>
                        {plans.map(pl => <option key={pl.code} value={pl.code}>{pl.name}</option>)}
                      </select>
                      {p.sub_status === 'trialing' && p.trial_ends_at &&
                        <div className="muted">trial ends {new Date(p.trial_ends_at).toLocaleDateString()}</div>}
                    </td>
                    <td>{p.clinicians}</td>
                    <td>{p.patients}</td>
                    <td><span className={`badge ${p.status === 'active' ? 'funded' : 'denied'}`}>{p.status}</span></td>
                    <td>
                      <button onClick={() => toggleStatus(p)}>
                        {p.status === 'active' ? 'Suspend' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                ))}
                {!practices.length && <tr><td colSpan="7" className="muted">No practices yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'Plans' && (
          <div className="spec-grid">
            {plans.map(p => (
              <div className="card" key={p.code}>
                <b style={{ fontSize: 17 }}>{p.name}</b>
                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--accent)', margin: '6px 0' }}>
                  ${Number(p.price_per_seat).toFixed(0)}<small style={{ fontSize: 13, fontWeight: 500 }}>/clinician/mo</small>
                </div>
                <div className="muted" style={{ marginBottom: 8 }}>
                  {p.practices} practice{p.practices === 1 ? '' : 's'} · {p.max_clinicians ? `max ${p.max_clinicians}` : 'unlimited'}
                </div>
                <ul style={{ paddingLeft: 18, margin: 0 }}>
                  {(p.features || []).map((f, i) => <li key={i} className="muted" style={{ padding: '3px 0' }}>{f}</li>)}
                </ul>
              </div>
            ))}
          </div>
        )}

        {tab === 'Platform Analytics' && metrics && (
          <div className="card">
            <h3>Platform health</h3>
            <table>
              <tbody>
                <tr><td>Total practices</td><td><b>{metrics.practices}</b></td></tr>
                <tr><td>Active practices</td><td><b>{metrics.active_practices}</b></td></tr>
                <tr><td>Monthly recurring revenue</td><td><b>${Number(metrics.mrr).toLocaleString()}</b></td></tr>
                <tr><td>Clinicians on platform</td><td><b>{metrics.clinicians}</b></td></tr>
                <tr><td>Patients under management</td><td><b>{metrics.patients}</b></td></tr>
                <tr><td>Appointments (last 30 days)</td><td><b>{metrics.appointments_30d}</b></td></tr>
                <tr><td>Average patients per practice</td>
                    <td><b>{metrics.practices ? Math.round(metrics.patients / metrics.practices) : 0}</b></td></tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
