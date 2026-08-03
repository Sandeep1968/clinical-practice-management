import { useState } from 'react';
import { api, setToken } from '../api.js';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('owner@demo.practice');
  const [password, setPassword] = useState('Demo1234!');
  const [mfaToken, setMfaToken] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const finish = (res) => {
    setToken(res.accessToken);
    onLogin(res.user);
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const res = await api('/auth/login', { method: 'POST', body: { email, password } });
      if (res.mfaRequired) setMfaToken(res.mfaToken);
      else finish(res);
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  const submitCode = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const res = await api('/auth/mfa/complete', { method: 'POST', body: { mfaToken, code } });
      finish(res);
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  return (
    <div className="login-wrap">
      {!mfaToken ? (
        <form className="card login-card" onSubmit={submit}>
          <h2>ClinicOS</h2>
          <p className="muted">Clinical Practice Management</p>
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
          {error && <p className="error">{error}</p>}
          <button className="primary" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      ) : (
        <form className="card login-card" onSubmit={submitCode}>
          <h2>Two-factor code</h2>
          <p className="muted">Enter the 6-digit code from your authenticator app.</p>
          <input inputMode="numeric" pattern="\d{6}" maxLength={6} placeholder="000000" autoFocus
                 value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} required />
          {error && <p className="error">{error}</p>}
          <button className="primary" disabled={busy || code.length !== 6} style={{ width: '100%' }}>
            {busy ? 'Verifying…' : 'Verify'}
          </button>
          <button type="button" onClick={() => { setMfaToken(null); setCode(''); }} style={{ width: '100%', marginTop: 8 }}>
            Back
          </button>
        </form>
      )}
    </div>
  );
}
