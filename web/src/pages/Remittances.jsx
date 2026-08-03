import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Remittances() {
  const [remits, setRemits] = useState([]);
  const [lines, setLines] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () => api('/remittances').then(r => setRemits(r?.data || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const fetchEras = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await api('/remittances/fetch', { method: 'POST' });
      setMsg(r.posted
        ? `Posted ${r.posted} claim payment(s) from ${r.eras} ERA file(s). Claims moved to Funded; patient balances invoiced.`
        : r.message);
      load();
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  };

  const showLines = async (id) => {
    const r = await api(`/remittances/${id}`);
    setLines({ id, rows: r?.data || [] });
  };

  return (
    <>
      <h2>Remittances (ERA 835)</h2>
      <div className="row">
        <button className="primary" onClick={fetchEras} disabled={busy}>
          {busy ? 'Posting…' : 'Fetch & auto-post ERAs'}
        </button>
      </div>
      {msg && <p style={{ color: '#667085', fontSize: 13 }}>{msg}</p>}
      <div className="card">
        <table>
          <thead><tr><th>ERA Ref</th><th>Payer</th><th>Total Paid</th><th>Lines</th><th>Received</th><th></th></tr></thead>
          <tbody>
            {remits.map(r => (
              <tr key={r.id}>
                <td>{r.era_ref}</td>
                <td>{r.payer_name || '—'}</td>
                <td>${Number(r.total).toFixed(2)}</td>
                <td>{r.line_count}</td>
                <td>{new Date(r.received_at).toLocaleString()}</td>
                <td><button onClick={() => showLines(r.id)}>lines</button></td>
              </tr>
            ))}
            {!remits.length && <tr><td colSpan="6">No remittances yet. Submit a claim first, then fetch ERAs.</td></tr>}
          </tbody>
        </table>
      </div>
      {lines && (
        <div className="card">
          <h3>Remittance lines</h3>
          <table>
            <thead><tr><th>Claim #</th><th>Client</th><th>Billed</th><th>Paid</th><th>Patient Resp.</th><th>Adjustments</th></tr></thead>
            <tbody>
              {lines.rows.map(l => (
                <tr key={l.id}>
                  <td>{l.claim_number}</td>
                  <td>{l.client_name}</td>
                  <td>${Number(l.billed).toFixed(2)}</td>
                  <td>${Number(l.paid).toFixed(2)}</td>
                  <td>${Number(l.patient_responsibility).toFixed(2)}</td>
                  <td>{(l.adjustment_codes || []).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={() => setLines(null)} style={{ marginTop: 10 }}>Close</button>
        </div>
      )}
    </>
  );
}
