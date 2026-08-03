import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, setToken } from '../api.js';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('owner@demo.practice');
  const [password, setPassword] = useState('Demo1234!');
  const [mfaToken, setMfaToken] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('login');       // login | forgot | reset
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [notice, setNotice] = useState('');

  const forgot = async (e) => {
    e.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const r = await api('/auth/forgot', { method: 'POST', body: { email } });
      setNotice(r.message);
      if (r.devResetToken) { setResetToken(r.devResetToken); setMode('reset'); }
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  const reset = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      await api('/auth/reset', { method: 'POST', body: { token: resetToken, password: newPassword } });
      setNotice('Password updated — you can sign in now.');
      setPassword(''); setMode('login');
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

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

  if (mode === 'forgot') return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={forgot}>
        <h2>Reset your password</h2>
        <p className="muted">Enter your work email and we'll send a reset link.</p>
        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
        {error && <p className="error">{error}</p>}
        {notice && <p className="muted">{notice}</p>}
        <button className="primary" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Sending…' : 'Send reset link'}
        </button>
        <button type="button" onClick={() => { setMode('login'); setError(''); }} style={{ width: '100%', marginTop: 8 }}>
          Back to sign in
        </button>
      </form>
    </div>
  );

  if (mode === 'reset') return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={reset}>
        <h2>Choose a new password</h2>
        <p className="muted">Reset link verified. Pick a password of at least 8 characters.</p>
        <input type="password" placeholder="New password" minLength={8}
               value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Saving…' : 'Set new password'}
        </button>
      </form>
    </div>
  );

  return (
    <div className="login-wrap">
      {!mfaToken ? (
        <form className="card login-card" onSubmit={submit}>
          <h2>ClinicOS</h2>
          <p className="muted">Clinical Practice Management</p>
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
          {error && <p className="error">{error}</p>}
          {notice && <p className="muted">{notice}</p>}
          <button className="primary" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 12, marginBottom: 0 }}>
            <button type="button" onClick={() => { setMode('forgot'); setError(''); }}
                    style={{ border: 'none', padding: 0, background: 'none', color: 'var(--muted)' }}>
              Forgot password?
            </button>
            <Link to="/signup" className="muted">Create a practice →</Link>
          </div>
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
