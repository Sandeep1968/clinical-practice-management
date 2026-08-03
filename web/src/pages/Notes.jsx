import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Notes() {
  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(null);
  const [template, setTemplate] = useState('SOAP');
  const [text, setText] = useState('');
  const [cpt, setCpt] = useState('90837');
  const [rate, setRate] = useState('150');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () => api('/encounters/unsigned').then(r => setQueue(r?.data || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const open = (enc) => { setCurrent(enc); setText(''); setMsg(''); };

  const generate = async () => {
    setBusy(true); setMsg('');
    try {
      const d = await api(`/encounters/${current.id}/ai-draft`, {
        method: 'POST', body: { templateType: template }
      });
      setText(d.draft);
      setMsg(d.disclaimer);
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  };

  const sign = async () => {
    setBusy(true); setMsg('');
    try {
      await api(`/encounters/${current.id}/note`, {
        method: 'PUT', body: { templateType: template, finalText: text }
      });
      await api(`/encounters/${current.id}/sign`, {
        method: 'POST', body: { cptCodes: [cpt], rate: Number(rate) }
      });
      setMsg('Signed and locked. A draft claim was created for billing.');
      setCurrent(null);
      load();
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  };

  return (
    <>
      <h2>Notes</h2>
      <div className="card">
        <h3>Unsigned encounters</h3>
        <table>
          <thead><tr><th>Date of Service</th><th>Client</th><th></th></tr></thead>
          <tbody>
            {queue.map(e => (
              <tr key={e.id}>
                <td>{new Date(e.dos).toLocaleDateString()}</td>
                <td>{e.first_name} {e.last_name}</td>
                <td><button onClick={() => open(e)}>Open</button></td>
              </tr>
            ))}
            {!queue.length && <tr><td colSpan="3">No unsigned notes. Complete an appointment to create an encounter.</td></tr>}
          </tbody>
        </table>
      </div>

      {current && (
        <div className="card">
          <h3>Note — {current.first_name} {current.last_name}, {new Date(current.dos).toLocaleDateString()}</h3>
          <div className="row">
            <select value={template} onChange={e => setTemplate(e.target.value)}>
              <option>SOAP</option><option>DAP</option><option>BIRP</option>
            </select>
            <button className="primary" onClick={generate} disabled={busy}>
              {busy ? 'Working…' : 'Generate AI draft'}
            </button>
          </div>
          <textarea
            value={text} onChange={e => setText(e.target.value)}
            rows={14} style={{ width: '100%', font: 'inherit', padding: 10 }}
            placeholder="Write the note or generate an AI draft, then review and edit…"
          />
          <div className="row" style={{ marginTop: 10 }}>
            <input value={cpt} onChange={e => setCpt(e.target.value)} placeholder="CPT code" style={{ width: 110 }} />
            <input value={rate} onChange={e => setRate(e.target.value)} placeholder="Rate" style={{ width: 100 }} />
            <button className="primary" onClick={sign} disabled={busy || !text.trim()}>
              Sign & lock (releases billing)
            </button>
          </div>
          {msg && <p style={{ color: '#667085', fontSize: 13 }}>{msg}</p>}
        </div>
      )}
    </>
  );
}
