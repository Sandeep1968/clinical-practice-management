import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';

const emptyMed = { name: '', strength: '', frequency: '1-0-1', duration: '7 days', instructions: 'After food' };

export default function Prescriptions() {
  const [params] = useSearchParams();
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState(params.get('client') || '');
  const [history, setHistory] = useState([]);
  const [meds, setMeds] = useState([{ ...emptyMed }]);
  const [dx, setDx] = useState([{ code: '', label: '' }]);
  const [advice, setAdvice] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [printRx, setPrintRx] = useState(null);
  const [msg, setMsg] = useState('');

  useEffect(() => { api('/clients').then(r => setClients(r?.data || [])).catch(() => {}); }, []);
  useEffect(() => {
    if (clientId) api(`/prescriptions/client/${clientId}`).then(r => setHistory(r?.data || [])).catch(() => {});
    else setHistory([]);
  }, [clientId]);

  const save = async () => {
    setMsg('');
    try {
      const rx = await api('/prescriptions', {
        method: 'POST',
        body: {
          clientId,
          medications: meds.filter(m => m.name.trim()),
          diagnoses: dx.filter(d => d.label.trim()),
          advice, followUpDate: followUp || null
        }
      });
      setMsg('Prescription saved.');
      setMeds([{ ...emptyMed }]); setDx([{ code: '', label: '' }]); setAdvice(''); setFollowUp('');
      api(`/prescriptions/client/${clientId}`).then(r => setHistory(r?.data || []));
      openPrint(rx.id);
    } catch (e) { setMsg(e.message); }
  };

  const openPrint = async (id) => {
    const rx = await api(`/prescriptions/${id}/print`);
    setPrintRx(rx);
  };

  const setMed = (i, k, v) => setMeds(m => m.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const setD = (i, k, v) => setDx(d => d.map((x, j) => j === i ? { ...x, [k]: v } : x));

  if (printRx) {
    const meds = printRx.medications || [];
    return (
      <div className="rx-print-wrap">
        <div className="rx-print card">
          <div className="rx-head">
            <div>
              <h2 style={{ margin: 0 }}>{printRx.practice_name}</h2>
              <div className="muted">{printRx.clinician_name} · NPI {printRx.npi || '—'} · Lic {printRx.license_no || '—'}</div>
            </div>
            <div style={{ textAlign: 'right' }} className="muted">
              {new Date(printRx.created_at).toLocaleDateString()}
            </div>
          </div>
          <hr />
          <p><b>Patient:</b> {printRx.client_name} {printRx.dob && `· DOB ${new Date(printRx.dob).toLocaleDateString()}`}</p>
          {(printRx.diagnoses || []).length > 0 && (
            <p><b>Diagnosis:</b> {(printRx.diagnoses).map(d => `${d.label}${d.code ? ` (${d.code})` : ''}`).join(', ')}</p>
          )}
          <h3 style={{ marginBottom: 6 }}>℞</h3>
          <table>
            <thead><tr><th>#</th><th>Medication</th><th>Strength</th><th>Frequency</th><th>Duration</th><th>Instructions</th></tr></thead>
            <tbody>
              {meds.map((m, i) => (
                <tr key={i}><td>{i + 1}</td><td>{m.name}</td><td>{m.strength}</td><td>{m.frequency}</td><td>{m.duration}</td><td>{m.instructions}</td></tr>
              ))}
            </tbody>
          </table>
          {printRx.advice && <p style={{ marginTop: 14 }}><b>Advice:</b> {printRx.advice}</p>}
          {printRx.follow_up_date && <p><b>Follow-up:</b> {new Date(printRx.follow_up_date).toLocaleDateString()}</p>}
          <div style={{ marginTop: 40, textAlign: 'right' }}>
            <div style={{ borderTop: '1px solid #999', display: 'inline-block', paddingTop: 4, minWidth: 180 }}>
              {printRx.clinician_name}
            </div>
          </div>
        </div>
        <div className="row no-print" style={{ marginTop: 14 }}>
          <button className="primary" onClick={() => window.print()}>Print</button>
          <button onClick={() => setPrintRx(null)}>Back</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <h2>Digital Prescription</h2>
      <div className="card">
        <div className="row">
          <select value={clientId} onChange={e => setClientId(e.target.value)}>
            <option value="">Select patient…</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.last_name}, {c.first_name}</option>)}
          </select>
        </div>
        {clientId && (
          <>
            <h3>Diagnoses</h3>
            {dx.map((d, i) => (
              <div className="row" key={i}>
                <input placeholder="ICD-10 (e.g. F41.1)" value={d.code} onChange={e => setD(i, 'code', e.target.value)} style={{ width: 140 }} />
                <input placeholder="Diagnosis" value={d.label} onChange={e => setD(i, 'label', e.target.value)} style={{ flex: 1 }} />
              </div>
            ))}
            <button onClick={() => setDx(d => [...d, { code: '', label: '' }])}>+ diagnosis</button>

            <h3>Medications</h3>
            {meds.map((m, i) => (
              <div className="row" key={i}>
                <input placeholder="Drug name" value={m.name} onChange={e => setMed(i, 'name', e.target.value)} style={{ flex: 2 }} />
                <input placeholder="Strength" value={m.strength} onChange={e => setMed(i, 'strength', e.target.value)} style={{ width: 90 }} />
                <input placeholder="Frequency" value={m.frequency} onChange={e => setMed(i, 'frequency', e.target.value)} style={{ width: 90 }} />
                <input placeholder="Duration" value={m.duration} onChange={e => setMed(i, 'duration', e.target.value)} style={{ width: 90 }} />
                <input placeholder="Instructions" value={m.instructions} onChange={e => setMed(i, 'instructions', e.target.value)} style={{ flex: 1 }} />
              </div>
            ))}
            <button onClick={() => setMeds(m => [...m, { ...emptyMed }])}>+ medication</button>

            <h3>Advice & Follow-up</h3>
            <div className="row">
              <input placeholder="General advice" value={advice} onChange={e => setAdvice(e.target.value)} style={{ flex: 1 }} />
              <input type="date" value={followUp} onChange={e => setFollowUp(e.target.value)} />
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="primary" onClick={save} disabled={!meds.some(m => m.name.trim())}>
                Save & preview Rx
              </button>
            </div>
            {msg && <p className="muted">{msg}</p>}
          </>
        )}
      </div>

      {history.length > 0 && (
        <div className="card">
          <h3>Past prescriptions</h3>
          <table>
            <thead><tr><th>Date</th><th>Medications</th><th>By</th><th></th></tr></thead>
            <tbody>
              {history.map(h => (
                <tr key={h.id}>
                  <td>{new Date(h.created_at).toLocaleDateString()}</td>
                  <td>{(h.medications || []).map(m => m.name).join(', ')}</td>
                  <td>{h.clinician_name}</td>
                  <td><button onClick={() => openPrint(h.id)}>view / print</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
