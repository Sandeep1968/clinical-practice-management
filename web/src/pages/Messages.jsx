import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Avatar } from '../ui.jsx';

const AUDIENCES = [
  ['all', 'All active patients'],
  ['upcoming', 'Patients with visits in the next 7 days'],
  ['outstanding_balance', 'Patients with an outstanding balance']
];

export default function Messages({ user }) {
  const [tab, setTab] = useState('Inbox');
  const [threads, setThreads] = useState([]);
  const [open, setOpen] = useState(null);
  const [reply, setReply] = useState('');
  const [clients, setClients] = useState([]);
  const [compose, setCompose] = useState({ clientId: '', subject: '', body: '' });
  const [bc, setBc] = useState({ body: '', audience: 'all', channel: 'sms' });
  const [broadcasts, setBroadcasts] = useState([]);
  const [msg, setMsg] = useState('');
  const canBroadcast = ['owner', 'admin', 'front_desk'].includes(user.role);

  const load = () => {
    api('/messages/threads').then(r => setThreads(r?.data || [])).catch(() => {});
    api('/clients').then(r => setClients(r?.data || [])).catch(() => {});
    if (canBroadcast) api('/messages/broadcasts').then(r => setBroadcasts(r?.data || [])).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const view = async (id) => { setOpen(await api(`/messages/threads/${id}`)); load(); };

  const sendReply = async (e) => {
    e.preventDefault();
    await api(`/messages/threads/${open.id}/reply`, { method: 'POST', body: { body: reply } });
    setReply(''); view(open.id);
  };

  const startThread = async (e) => {
    e.preventDefault(); setMsg('');
    try {
      const t = await api('/messages/threads', { method: 'POST', body: compose });
      setCompose({ clientId: '', subject: '', body: '' }); setTab('Inbox'); load(); view(t.id);
    } catch (err) { setMsg(err.message); }
  };

  const sendBroadcast = async (e) => {
    e.preventDefault(); setMsg('');
    try {
      const r = await api('/messages/broadcasts', { method: 'POST', body: bc });
      setMsg(`Sent to ${r.recipients} patient(s)${r.skipped ? `, ${r.skipped} skipped (no consent or phone)` : ''}.`);
      setBc({ ...bc, body: '' }); load();
    } catch (err) { setMsg(err.message); }
  };

  if (open) {
    return (
      <>
        <div className="row"><button onClick={() => setOpen(null)}>← Inbox</button></div>
        <div className="chart-head card">
          <Avatar name={open.client_name} size={44} />
          <div><h2 style={{ margin: 0, fontSize: 19 }}>{open.subject}</h2>
            <div className="muted">{open.client_name}</div></div>
        </div>
        <div className="card">
          {open.messages.map(m => (
            <div key={m.id} className={`bubble-row ${m.sender_kind}`}>
              <div className="bubble">
                {m.body}
                <div className="bubble-meta">
                  {m.sender_kind === 'staff' ? (m.sender_name || 'Clinic') : open.client_name} ·{' '}
                  {new Date(m.created_at).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
          <form className="row" onSubmit={sendReply} style={{ marginTop: 14, marginBottom: 0 }}>
            <input placeholder="Write a reply…" value={reply} onChange={e => setReply(e.target.value)}
                   style={{ flex: 1 }} required />
            <button className="primary">Send</button>
          </form>
        </div>
      </>
    );
  }

  return (
    <>
      <h2>Communication</h2>
      <div className="tabs">
        {['Inbox', 'New message', ...(canBroadcast ? ['Broadcast'] : [])].map(t => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === 'Inbox' && (
        <div className="card">
          <div className="people-list">
            {threads.map(t => (
              <div className="person-row" key={t.id} style={{ cursor: 'pointer' }} onClick={() => view(t.id)}>
                <Avatar name={t.client_name} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{t.client_name} — {t.subject}</div>
                  <div className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.preview}
                  </div>
                </div>
                {t.unread > 0 && <span className="badge denied">{t.unread} new</span>}
                <span className="muted">{new Date(t.last_message_at).toLocaleDateString()}</span>
              </div>
            ))}
            {!threads.length && <p className="muted">No messages yet.</p>}
          </div>
        </div>
      )}

      {tab === 'New message' && (
        <form className="card" onSubmit={startThread}>
          <h3>Message a patient</h3>
          <div className="row">
            <select value={compose.clientId} onChange={e => setCompose({ ...compose, clientId: e.target.value })} required>
              <option value="">Select patient…</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.last_name}, {c.first_name}</option>)}
            </select>
            <input placeholder="Subject" value={compose.subject}
                   onChange={e => setCompose({ ...compose, subject: e.target.value })} style={{ flex: 1 }} />
          </div>
          <textarea rows={4} placeholder="Your message…" value={compose.body} required
                    onChange={e => setCompose({ ...compose, body: e.target.value })}
                    style={{ width: '100%', marginBottom: 12 }} />
          <button className="primary">Send securely</button>
        </form>
      )}

      {tab === 'Broadcast' && (
        <>
          <form className="card" onSubmit={sendBroadcast}>
            <h3>Broadcast to patients</h3>
            <div className="row">
              <select value={bc.audience} onChange={e => setBc({ ...bc, audience: e.target.value })}>
                {AUDIENCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <select value={bc.channel} onChange={e => setBc({ ...bc, channel: e.target.value })}>
                <option value="sms">SMS (consented patients only)</option>
                <option value="portal">Portal message (all)</option>
              </select>
            </div>
            <textarea rows={3} placeholder="e.g. Our office will close early on Friday at 2pm." required
                      value={bc.body} onChange={e => setBc({ ...bc, body: e.target.value })}
                      style={{ width: '100%', marginBottom: 12 }} />
            <button className="primary">Send broadcast</button>
            <p className="muted" style={{ marginTop: 10 }}>
              TCPA: SMS is only delivered to patients who gave consent and have a mobile number on file.
            </p>
          </form>
          <div className="card">
            <h3>Recent broadcasts</h3>
            <table>
              <thead><tr><th>Sent</th><th>Channel</th><th>Audience</th><th>Message</th><th>Delivered</th></tr></thead>
              <tbody>
                {broadcasts.map(b => (
                  <tr key={b.id}>
                    <td className="muted">{new Date(b.sent_at).toLocaleDateString()}</td>
                    <td>{b.channel}</td>
                    <td className="muted">{b.audience.replaceAll('_', ' ')}</td>
                    <td style={{ maxWidth: 300 }}>{b.body}</td>
                    <td>{b.recipients}{b.skipped ? <span className="muted"> (+{b.skipped} skipped)</span> : null}</td>
                  </tr>
                ))}
                {!broadcasts.length && <tr><td colSpan="5" className="muted">No broadcasts yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
      {msg && <p className="muted">{msg}</p>}
    </>
  );
}
