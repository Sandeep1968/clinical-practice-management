import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Avatar } from '../ui.jsx';

export default function Billing() {
  const [tab, setTab] = useState('Outstanding');
  const [invoices, setInvoices] = useState([]);
  const [plans, setPlans] = useState([]);
  const [open, setOpen] = useState(null);
  const [planForm, setPlanForm] = useState(null);   // { invoiceId, installments, cadence }
  const [msg, setMsg] = useState('');

  const load = () => {
    api('/billing/invoices').then(r => setInvoices(r?.data || [])).catch(() => {});
    api('/billing/plans').then(r => setPlans(r?.data || [])).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const pay = async (id) => { await api(`/billing/invoices/${id}/pay`, { method: 'POST', body: {} }); load(); };

  const createPlan = async (e) => {
    e.preventDefault(); setMsg('');
    try {
      await api('/billing/plans', { method: 'POST', body: planForm });
      setMsg('Payment plan created.'); setPlanForm(null); load(); setTab('Payment plans');
    } catch (err) { setMsg(err.message); }
  };

  const viewPlan = async (id) => setOpen(await api(`/billing/plans/${id}`));

  const payItem = async (itemId) => {
    await api(`/billing/plans/items/${itemId}/pay`, { method: 'POST' });
    viewPlan(open.id); load();
  };

  if (open) {
    const paid = open.items.filter(i => i.paid_at).length;
    return (
      <>
        <div className="row"><button onClick={() => setOpen(null)}>← All plans</button></div>
        <div className="chart-head card">
          <Avatar name={open.client_name} size={46} />
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 20 }}>{open.client_name}</h2>
            <div className="muted">
              ${Number(open.total_amount).toFixed(2)} over {open.installments} {open.cadence} installments ·
              {' '}{paid}/{open.items.length} paid
            </div>
          </div>
          <span className={`badge ${open.status === 'completed' ? 'funded' : 'submitted'}`}>{open.status}</span>
        </div>
        <div className="card">
          <table>
            <thead><tr><th>#</th><th>Due</th><th>Amount</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {open.items.map(i => (
                <tr key={i.id}>
                  <td>{i.seq}</td>
                  <td>{new Date(i.due_date).toLocaleDateString()}</td>
                  <td>${Number(i.amount).toFixed(2)}</td>
                  <td><span className={`badge ${i.paid_at ? 'funded' : 'draft'}`}>{i.paid_at ? 'paid' : 'scheduled'}</span></td>
                  <td>{!i.paid_at && <button className="primary" style={{ padding: '4px 12px' }} onClick={() => payItem(i.id)}>Charge</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  return (
    <>
      <h2>Billing</h2>
      <div className="tabs">
        {['Outstanding', 'Payment plans'].map(t => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === 'Outstanding' && (
        <div className="card">
          <table>
            <thead><tr><th>Patient</th><th>Invoiced</th><th>Balance</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {invoices.map(i => (
                <tr key={i.id}>
                  <td>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar name={i.client_name} size={30} /><b>{i.client_name}</b>
                    </span>
                  </td>
                  <td className="muted">{new Date(i.created_at).toLocaleDateString()}</td>
                  <td><b>${Number(i.balance).toFixed(2)}</b> <span className="muted">of ${Number(i.amount).toFixed(2)}</span></td>
                  <td>
                    <span className={`badge ${i.status === 'paid' ? 'funded' : 'in_revision'}`}>{i.status}</span>
                    {i.has_plan > 0 && <span className="badge submitted" style={{ marginLeft: 6 }}>plan</span>}
                  </td>
                  <td>
                    <button className="primary" style={{ padding: '4px 12px', marginRight: 6 }} onClick={() => pay(i.id)}>Charge full</button>
                    {!i.has_plan && (
                      <button onClick={() => setPlanForm({ invoiceId: i.id, installments: 3, cadence: 'monthly', autoCharge: true })}>
                        Payment plan
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!invoices.length && <tr><td colSpan="5" className="muted">No outstanding balances. 🎉</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {planForm && (
        <form className="card" onSubmit={createPlan}>
          <h3>New payment plan</h3>
          <div className="row" style={{ marginBottom: 0 }}>
            <label className="muted">Installments
              <input type="number" min="2" max="24" value={planForm.installments} style={{ width: 80, marginLeft: 8 }}
                     onChange={e => setPlanForm({ ...planForm, installments: +e.target.value })} />
            </label>
            <select value={planForm.cadence} onChange={e => setPlanForm({ ...planForm, cadence: e.target.value })}>
              <option value="weekly">Weekly</option><option value="biweekly">Biweekly</option><option value="monthly">Monthly</option>
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={planForm.autoCharge}
                     onChange={e => setPlanForm({ ...planForm, autoCharge: e.target.checked })} />
              Auto-charge card on file
            </label>
            <button className="primary">Create plan</button>
            <button type="button" onClick={() => setPlanForm(null)}>Cancel</button>
          </div>
        </form>
      )}

      {tab === 'Payment plans' && (
        <div className="card">
          <table>
            <thead><tr><th>Patient</th><th>Total</th><th>Schedule</th><th>Progress</th><th>Remaining</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {plans.map(p => (
                <tr key={p.id}>
                  <td>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar name={p.client_name} size={30} /><b>{p.client_name}</b>
                    </span>
                  </td>
                  <td>${Number(p.total_amount).toFixed(2)}</td>
                  <td className="muted">{p.installments} × {p.cadence}</td>
                  <td>{p.paid_count}/{p.installments} paid</td>
                  <td>${Number(p.remaining).toFixed(2)}</td>
                  <td><span className={`badge ${p.status === 'completed' ? 'funded' : 'submitted'}`}>{p.status}</span></td>
                  <td><button onClick={() => viewPlan(p.id)}>open</button></td>
                </tr>
              ))}
              {!plans.length && <tr><td colSpan="7" className="muted">No payment plans yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {msg && <p className="muted">{msg}</p>}
    </>
  );
}
