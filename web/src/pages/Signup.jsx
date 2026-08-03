import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, setToken } from '../api.js';

export default function Signup({ onLogin }) {
  const [plans, setPlans] = useState([]);
  const [form, setForm] = useState({
    practiceName: '', subdomain: '', fullName: '', email: '', password: '', plan: 'professional'
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api('/auth/plans').then(r => setPlans(r?.data || [])).catch(() => {}); }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const autoSub = (name) => {
    set('practiceName', name);
    if (!form.subdomain || form.subdomain === slug(form.practiceName)) set('subdomain', slug(name));
  };
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const res = await api('/auth/signup', { method: 'POST', body: form });
      setToken(res.accessToken);
      onLogin(res.user);
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  return (
    <div className="signup-wrap">
      <div className="signup-panel">
        <Link to="/" className="land-logo" style={{ textDecoration: 'none' }}>＋ ClinicOS</Link>
        <h2 style={{ marginTop: 26 }}>Start your 14-day free trial</h2>
        <p className="muted">No credit card required. Your practice gets its own secure, isolated workspace.</p>
        <ul className="signup-points">
          <li>✓ Scheduling, patient records & digital prescriptions</li>
          <li>✓ Insurance eligibility, claims & ERA auto-posting</li>
          <li>✓ AI clinical notes with clinician sign-off</li>
          <li>✓ HIPAA-grade security, MFA & audit logging</li>
        </ul>
      </div>

      <form className="signup-form card" onSubmit={submit}>
        <h3>Create your practice account</h3>

        <label>Practice name</label>
        <input value={form.practiceName} onChange={e => autoSub(e.target.value)}
               placeholder="Riverside Family Health" required />

        <label>Clinic address</label>
        <div className="sub-row">
          <input value={form.subdomain} onChange={e => set('subdomain', slug(e.target.value))}
                 placeholder="riverside-health" required />
          <span className="muted">.clinicos.app</span>
        </div>

        <label>Your name</label>
        <input value={form.fullName} onChange={e => set('fullName', e.target.value)}
               placeholder="Dr. Jane Smith" required />

        <label>Work email</label>
        <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
               placeholder="jane@riversidehealth.com" required />

        <label>Password</label>
        <input type="password" value={form.password} onChange={e => set('password', e.target.value)}
               placeholder="At least 8 characters" minLength={8} required />

        <label>Plan</label>
        <div className="plan-row">
          {plans.map(p => (
            <button type="button" key={p.code}
                    className={`plan-pick ${form.plan === p.code ? 'active' : ''}`}
                    onClick={() => set('plan', p.code)}>
              <b>{p.name}</b>
              <span>${Number(p.price_per_seat).toFixed(0)}<small>/clinician/mo</small></span>
              <small className="muted">{p.max_clinicians ? `up to ${p.max_clinicians} clinicians` : 'unlimited clinicians'}</small>
            </button>
          ))}
        </div>

        {error && <p className="error">{error}</p>}
        <button className="primary big" disabled={busy} style={{ width: '100%', marginTop: 6 }}>
          {busy ? 'Creating your practice…' : 'Create practice & start trial'}
        </button>
        <p className="muted" style={{ textAlign: 'center', marginTop: 12 }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
