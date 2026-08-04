import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Avatar } from '../ui.jsx';

const today = () => new Date().toISOString().slice(0, 10);
const monthsAgo = (n) => { const d = new Date(); d.setMonth(d.getMonth() - n); return d.toISOString().slice(0, 10); };

export default function Financials() {
  const [tab, setTab] = useState('Fee schedule');
  const [codes, setCodes] = useState([]);
  const [clients, setClients] = useState([]);
  const [gfeNeeded, setGfeNeeded] = useState([]);
  const [superbills, setSuperbills] = useState([]);
  const [statements, setStatements] = useState([]);
  const [print, setPrint] = useState(null);
  const [msg, setMsg] = useState('');

  const [newCode, setNewCode] = useState({ cpt: '', description: '', defaultRate: '', durationMinutes: 50 });
  const [fee, setFee] = useState({ clientId: '', payType: 'sliding_scale', slidingRate: '', discountPct: '', notes: '' });
  const [gfe, setGfe] = useState({ clientId: '', serviceCpt: '90837', expectedSessions: 12 });
  const [sb, setSb] = useState({ clientId: '', periodStart: monthsAgo(6), periodEnd: today() });
  const [st, setSt] = useState({ clientId: '', periodStart: monthsAgo(1), periodEnd: today() });

  const load = () => {
    api('/financials/service-codes').then(r => setCodes(r?.data || [])).catch(() => {});
    api('/clients').then(r => setClients(r?.data || [])).catch(() => {});
    api('/financials/gfe/needed').then(r => setGfeNeeded(r?.data || [])).catch(() => {});
    api('/financials/superbills').then(r => setSuperbills(r?.data || [])).catch(() => {});
    api('/financials/statements').then(r => setStatements(r?.data || [])).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const addCode = async (e) => {
    e.preventDefault(); setMsg('');
    try { await api('/financials/service-codes', { method: 'POST', body: newCode });
      setNewCode({ cpt: '', description: '', defaultRate: '', durationMinutes: 50 }); load(); }
    catch (err) { setMsg(err.message); }
  };

  const saveFee = async (e) => {
    e.preventDefault(); setMsg('');
    try {
      await api('/financials/fee-agreement', { method: 'POST', body: fee });
      setMsg('Fee agreement saved. New sessions will use this rate.'); load();
    } catch (err) { setMsg(err.message); }
  };

  const issueGfe = async (e) => {
    e.preventDefault(); setMsg('');
    try {
      const g = await api('/financials/gfe', { method: 'POST', body: gfe });
      setMsg(`Good Faith Estimate issued: $${Number(g.total_estimate).toFixed(2)} for ${g.expected_sessions} sessions.`);
      load();
    } catch (err) { setMsg(err.message); }
  };

  const makeSuperbill = async (e) => {
    e.preventDefault(); setMsg('');
    try { const s = await api('/financials/superbills', { method: 'POST', body: sb });
      setPrint(await api(`/financials/superbills/${s.id}`)); load(); }
    catch (err) { setMsg(err.message); }
  };

  const makeStatement = async (e) => {
    e.preventDefault(); setMsg('');
    try { await api('/financials/statements', { method: 'POST', body: st }); setMsg('Statement generated.'); load(); }
    catch (err) { setMsg(err.message); }
  };

  if (print) {
    return (
      <div className="rx-print-wrap">
        <div className="rx-print card">
          <div className="rx-head">
            <div>
              <h2 style={{ margin: 0 }}>{print.practice_name || 'Practice'}</h2>
              <div className="muted">{print.practice_address}</div>
              <div className="muted">Tax ID {print.tax_id || '—'} · NPI {print.group_npi || print.npi || '—'}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <b>SUPERBILL</b>
              <div className="muted">{new Date(print.generated_at).toLocaleDateString()}</div>
            </div>
          </div>
          <hr />
          <p><b>Patient:</b> {print.client_name}{print.dob && ` · DOB ${new Date(print.dob).toLocaleDateString()}`}</p>
          <p><b>Provider:</b> {print.clinician_name} · NPI {print.npi || '—'} · Lic {print.license_no || '—'}</p>
          <p className="muted">
            Period {new Date(print.period_start).toLocaleDateString()} – {new Date(print.period_end).toLocaleDateString()}
          </p>
          <table>
            <thead><tr><th>Date</th><th>CPT</th><th>Description</th><th>ICD-10</th><th>Units</th><th>Amount</th></tr></thead>
            <tbody>
              {(print.lines || []).map((l, i) => (
                <tr key={i}>
                  <td>{new Date(l.dos).toLocaleDateString()}</td>
                  <td>{l.cpt}</td>
                  <td>{l.description}</td>
                  <td>{(l.icd || []).join(', ') || '—'}</td>
                  <td>{l.units}</td>
                  <td>${Number(l.amount).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3 style={{ textAlign: 'right', marginTop: 14 }}>Total: ${Number(print.total).toFixed(2)}</h3>
          <p className="muted" style={{ marginTop: 20 }}>
            This superbill is provided for submission to your insurance carrier for out-of-network reimbursement.
            Payment for services has been received in full unless otherwise noted.
          </p>
        </div>
        <div className="row no-print" style={{ marginTop: 14 }}>
          <button className="primary" onClick={() => window.print()}>Print</button>
          <button onClick={() => setPrint(null)}>Back</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <h2>Financials</h2>
      <div className="tabs">
        {['Fee schedule', 'Sliding scale', 'Good Faith Estimates', 'Superbills', 'Statements'].map(t => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === 'Fee schedule' && (
        <>
          <div className="card">
            <h3>Service codes</h3>
            <table>
              <thead><tr><th>CPT</th><th>Description</th><th>Duration</th><th>Standard rate</th></tr></thead>
              <tbody>
                {codes.map(c => (
                  <tr key={c.id}>
                    <td><b>{c.cpt}</b></td>
                    <td>{c.description}</td>
                    <td className="muted">{c.duration_minutes} min</td>
                    <td>${Number(c.default_rate).toFixed(2)}</td>
                  </tr>
                ))}
                {!codes.length && <tr><td colSpan="4" className="muted">No service codes.</td></tr>}
              </tbody>
            </table>
            <p className="muted" style={{ marginTop: 10 }}>
              CPT codes are updated annually — maintain them here rather than in code.
            </p>
          </div>
          <form className="card row" onSubmit={addCode} style={{ marginBottom: 18 }}>
            <input placeholder="CPT" value={newCode.cpt} required style={{ width: 90 }}
                   onChange={e => setNewCode({ ...newCode, cpt: e.target.value })} />
            <input placeholder="Description" value={newCode.description} required style={{ flex: 1 }}
                   onChange={e => setNewCode({ ...newCode, description: e.target.value })} />
            <input type="number" placeholder="Rate" value={newCode.defaultRate} required style={{ width: 100 }}
                   onChange={e => setNewCode({ ...newCode, defaultRate: e.target.value })} />
            <button className="primary">Add / update</button>
          </form>
        </>
      )}

      {tab === 'Sliding scale' && (
        <form className="card" onSubmit={saveFee}>
          <h3>Client fee agreement</h3>
          <p className="muted">Sliding scale and self-pay arrangements — common in therapy practices.</p>
          <div className="row">
            <select value={fee.clientId} required onChange={e => setFee({ ...fee, clientId: e.target.value })}>
              <option value="">Select client…</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.last_name}, {c.first_name}</option>)}
            </select>
            <select value={fee.payType} onChange={e => setFee({ ...fee, payType: e.target.value })}>
              <option value="insurance">Insurance</option>
              <option value="self_pay">Self-pay</option>
              <option value="sliding_scale">Sliding scale</option>
            </select>
            <input type="number" placeholder="Agreed rate $" value={fee.slidingRate} style={{ width: 130 }}
                   onChange={e => setFee({ ...fee, slidingRate: e.target.value, discountPct: '' })} />
            <span className="muted">or</span>
            <input type="number" placeholder="% off" value={fee.discountPct} style={{ width: 90 }}
                   onChange={e => setFee({ ...fee, discountPct: e.target.value, slidingRate: '' })} />
            <button className="primary">Save agreement</button>
          </div>
          <p className="muted">
            Self-pay and sliding-scale clients require a Good Faith Estimate under the No Surprises Act.
          </p>
        </form>
      )}

      {tab === 'Good Faith Estimates' && (
        <>
          {gfeNeeded.length > 0 && (
            <div className="card" style={{ borderColor: 'var(--amber)', background: 'var(--amber-soft)' }}>
              <h3>⚠ Self-pay clients without a current Good Faith Estimate</h3>
              <p className="muted">
                The No Surprises Act requires a written GFE for uninsured/self-pay clients before service.
              </p>
              <div className="people-list">
                {gfeNeeded.map(c => (
                  <div className="person-row" key={c.id}>
                    <Avatar name={c.client_name} size={32} />
                    <div style={{ flex: 1 }}><b>{c.client_name}</b> <span className="muted">({c.pay_type.replaceAll('_',' ')})</span></div>
                    <button onClick={() => { setGfe({ ...gfe, clientId: c.id }); }}>issue GFE</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <form className="card" onSubmit={issueGfe}>
            <h3>Issue a Good Faith Estimate</h3>
            <div className="row">
              <select value={gfe.clientId} required onChange={e => setGfe({ ...gfe, clientId: e.target.value })}>
                <option value="">Select client…</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.last_name}, {c.first_name}</option>)}
              </select>
              <select value={gfe.serviceCpt} onChange={e => setGfe({ ...gfe, serviceCpt: e.target.value })}>
                {codes.map(c => <option key={c.cpt} value={c.cpt}>{c.cpt} — {c.description}</option>)}
              </select>
              <input type="number" min="1" value={gfe.expectedSessions} style={{ width: 110 }}
                     onChange={e => setGfe({ ...gfe, expectedSessions: +e.target.value })} title="expected sessions" />
              <button className="primary">Issue estimate</button>
            </div>
            <p className="muted">
              The estimate is calculated from the client's effective rate (sliding scale if agreed) and appears in their portal.
            </p>
          </form>
        </>
      )}

      {tab === 'Superbills' && (
        <>
          <form className="card row" onSubmit={makeSuperbill}>
            <select value={sb.clientId} required onChange={e => setSb({ ...sb, clientId: e.target.value })}>
              <option value="">Select client…</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.last_name}, {c.first_name}</option>)}
            </select>
            <input type="date" value={sb.periodStart} onChange={e => setSb({ ...sb, periodStart: e.target.value })} />
            <input type="date" value={sb.periodEnd} onChange={e => setSb({ ...sb, periodEnd: e.target.value })} />
            <button className="primary">Generate superbill</button>
          </form>
          <div className="card">
            <table>
              <thead><tr><th>Client</th><th>Period</th><th>Total</th><th>Generated</th><th></th></tr></thead>
              <tbody>
                {superbills.map(s => (
                  <tr key={s.id}>
                    <td><b>{s.client_name}</b></td>
                    <td className="muted">{new Date(s.period_start).toLocaleDateString()} – {new Date(s.period_end).toLocaleDateString()}</td>
                    <td>${Number(s.total).toFixed(2)}</td>
                    <td className="muted">{new Date(s.generated_at).toLocaleDateString()}</td>
                    <td><button onClick={async () => setPrint(await api(`/financials/superbills/${s.id}`))}>view / print</button></td>
                  </tr>
                ))}
                {!superbills.length && <tr><td colSpan="5" className="muted">No superbills yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'Statements' && (
        <>
          <form className="card row" onSubmit={makeStatement}>
            <select value={st.clientId} required onChange={e => setSt({ ...st, clientId: e.target.value })}>
              <option value="">Select client…</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.last_name}, {c.first_name}</option>)}
            </select>
            <input type="date" value={st.periodStart} onChange={e => setSt({ ...st, periodStart: e.target.value })} />
            <input type="date" value={st.periodEnd} onChange={e => setSt({ ...st, periodEnd: e.target.value })} />
            <button className="primary">Generate statement</button>
          </form>
          <div className="card">
            <table>
              <thead><tr><th>Client</th><th>Period</th><th>Charges</th><th>Payments</th><th>Balance</th></tr></thead>
              <tbody>
                {statements.map(s => (
                  <tr key={s.id}>
                    <td><b>{s.client_name}</b></td>
                    <td className="muted">{new Date(s.period_start).toLocaleDateString()} – {new Date(s.period_end).toLocaleDateString()}</td>
                    <td>${Number(s.charges).toFixed(2)}</td>
                    <td>${Number(s.payments).toFixed(2)}</td>
                    <td><b>${Number(s.balance).toFixed(2)}</b></td>
                  </tr>
                ))}
                {!statements.length && <tr><td colSpan="5" className="muted">No statements yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
      {msg && <p className="muted">{msg}</p>}
    </>
  );
}
