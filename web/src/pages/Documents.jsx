import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Avatar } from '../ui.jsx';

export default function Documents() {
  const navigate = useNavigate();
  const [pending, setPending] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [clients, setClients] = useState([]);
  const [send, setSend] = useState({ clientId: '', templateId: '' });
  const [upload, setUpload] = useState({ clientId: '', title: '', kind: 'upload', description: '' });
  const [msg, setMsg] = useState('');

  const load = () => {
    api('/documents/pending').then(r => setPending(r?.data || [])).catch(() => {});
    api('/documents/templates').then(r => setTemplates(r?.data || [])).catch(() => {});
    api('/clients').then(r => setClients(r?.data || [])).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const sendForm = async (e) => {
    e.preventDefault(); setMsg('');
    try {
      await api('/documents/send', { method: 'POST', body: send });
      setMsg('Sent — the patient will see it in their portal.');
      setSend({ clientId: '', templateId: '' }); load();
    } catch (err) { setMsg(err.message); }
  };

  const recordUpload = async (e) => {
    e.preventDefault(); setMsg('');
    try {
      await api('/documents', { method: 'POST', body: upload });
      setMsg('Document recorded.');
      setUpload({ clientId: '', title: '', kind: 'upload', description: '' });
    } catch (err) { setMsg(err.message); }
  };

  return (
    <>
      <h2>Documents & E-Signatures</h2>

      <div className="card">
        <h3>Send a form or consent for signature</h3>
        <form className="row" onSubmit={sendForm} style={{ marginBottom: 0 }}>
          <select value={send.clientId} onChange={e => setSend({ ...send, clientId: e.target.value })} required>
            <option value="">Select patient…</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.last_name}, {c.first_name}</option>)}
          </select>
          <select value={send.templateId} onChange={e => setSend({ ...send, templateId: e.target.value })} required>
            <option value="">Select form…</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button className="primary">Send to portal</button>
        </form>
      </div>

      <div className="card">
        <div className="card-head"><h3>Awaiting patient signature</h3><span className="muted">{pending.length} pending</span></div>
        <table>
          <thead><tr><th>Patient</th><th>Document</th><th>Type</th><th>Sent</th><th></th></tr></thead>
          <tbody>
            {pending.map(d => (
              <tr key={d.id}>
                <td>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar name={d.client_name} size={30} /><b>{d.client_name}</b>
                  </span>
                </td>
                <td>{d.title}</td>
                <td className="muted">{d.kind}</td>
                <td className="muted">{new Date(d.created_at).toLocaleDateString()}</td>
                <td><button onClick={() => navigate(`/patients/${d.client_id}`)}>chart</button></td>
              </tr>
            ))}
            {!pending.length && <tr><td colSpan="5" className="muted">Nothing awaiting signature. 🎉</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Record an uploaded document</h3>
        <p className="muted">Metadata is stored here; binaries belong in encrypted object storage (see README).</p>
        <form onSubmit={recordUpload}>
          <div className="row">
            <select value={upload.clientId} onChange={e => setUpload({ ...upload, clientId: e.target.value })}>
              <option value="">(practice-level, no patient)</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.last_name}, {c.first_name}</option>)}
            </select>
            <select value={upload.kind} onChange={e => setUpload({ ...upload, kind: e.target.value })}>
              {['upload', 'insurance_card', 'lab', 'referral', 'other'].map(k => <option key={k} value={k}>{k.replaceAll('_', ' ')}</option>)}
            </select>
            <input placeholder="Title" value={upload.title} required
                   onChange={e => setUpload({ ...upload, title: e.target.value })} style={{ flex: 1 }} />
            <button className="primary">Record</button>
          </div>
        </form>
      </div>
      {msg && <p className="muted">{msg}</p>}
    </>
  );
}
