import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Settings({ user }) {
  const [mfaEnabled, setMfaEnabled] = useState(null);
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [reminders, setReminders] = useState([]);

  useEffect(() => {
    api('/auth/mfa/status').then(r => setMfaEnabled(r.mfaEnabled)).catch(() => {});
    api('/reminders').then(r => setReminders(r?.data || [])).catch(() => {});
  }, []);

  const startSetup = async () => {
    setMsg('');
    const s = await api('/auth/mfa/setup', { method: 'POST' });
    setSetup(s);
  };

  const enable = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await api('/auth/mfa/enable', { method: 'POST', body: { code } });
      setMfaEnabled(true); setSetup(null); setCode('');
      setMsg('MFA enabled. You will be asked for a code at every sign-in.');
    } catch (err) { setMsg(err.message); }
  };

  return (
    <>
      <h2>Settings</h2>

      <div className="card">
        <h3>Two-factor authentication (TOTP)</h3>
        {mfaEnabled === null && <p className="muted">Loading…</p>}
        {mfaEnabled === true && <p><span className="badge funded">Enabled</span> <span className="muted">Codes required at sign-in.</span></p>}
        {mfaEnabled === false && !setup && (
          <>
            <p className="muted">Protect your account with an authenticator app (Google Authenticator, Authy, 1Password…). Required for HIPAA-grade access control.</p>
            <button className="primary" onClick={startSetup}>Set up MFA</button>
          </>
        )}
        {setup && (
          <form onSubmit={enable}>
            <p>1. Add this secret to your authenticator app (or scan the setup URI):</p>
            <p><code style={{ background: '#f2f3fa', padding: '6px 10px', borderRadius: 6, fontSize: 15, letterSpacing: 1 }}>{setup.secret}</code></p>
            <p className="muted" style={{ wordBreak: 'break-all' }}>{setup.otpauth}</p>
            <p>2. Enter the 6-digit code it shows:</p>
            <div className="row">
              <input inputMode="numeric" maxLength={6} placeholder="000000" value={code}
                     onChange={e => setCode(e.target.value.replace(/\D/g, ''))} style={{ width: 120 }} />
              <button className="primary" disabled={code.length !== 6}>Verify & enable</button>
            </div>
          </form>
        )}
        {msg && <p className="muted">{msg}</p>}
      </div>

      {['owner', 'admin', 'front_desk'].includes(user.role) && (
        <div className="card">
          <h3>SMS reminders</h3>
          <p className="muted">
            Scheduled 24h before each appointment. Sent only to patients with a phone number and SMS consent (TCPA).
            Mock mode logs messages; set Twilio env vars for real delivery.
          </p>
          <table>
            <thead><tr><th>Patient</th><th>Message</th><th>Scheduled for</th><th>Status</th></tr></thead>
            <tbody>
              {reminders.map(r => (
                <tr key={r.id}>
                  <td>{r.client_name}</td>
                  <td className="muted" style={{ maxWidth: 340 }}>{r.message}</td>
                  <td>{new Date(r.send_at).toLocaleString()}</td>
                  <td><span className={`badge ${r.status === 'sent' ? 'funded' : r.status === 'failed' ? 'denied' : r.status === 'scheduled' ? 'submitted' : 'draft'}`}>
                    {r.status.replaceAll('_', ' ')}</span></td>
                </tr>
              ))}
              {!reminders.length && <tr><td colSpan="4" className="muted">No reminders yet — book an appointment more than 24h out.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
