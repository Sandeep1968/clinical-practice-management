import { useEffect, useState } from 'react';
import { api } from '../api.js';

function BarRow({ label, value, max, money }) {
  const pct = max ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
        <span>{label}</span>
        <span className="muted">{money ? `$${Number(value).toLocaleString()}` : value}</span>
      </div>
      <div style={{ background: '#eef0f6', borderRadius: 6, height: 10 }}>
        <div style={{ width: `${pct}%`, background: 'var(--accent)', height: 10, borderRadius: 6 }} />
      </div>
    </div>
  );
}

export default function Analytics() {
  const [data, setData] = useState(null);

  useEffect(() => { api('/analytics/summary').then(setData).catch(() => {}); }, []);
  if (!data) return <h2>Analytics</h2>;

  const revMax = Math.max(...data.revenueByMonth.map(r => +r.total), 1);
  const claimMax = Math.max(...data.claimsFunnel.map(c => +c.value), 1);
  const appts = Object.fromEntries(data.appointments30d.map(a => [a.status, a.count]));

  return (
    <>
      <h2>Practice Analytics</h2>
      <div className="stat-grid">
        <div className="stat">
          <div className="num">${data.revenueByMonth.reduce((s, r) => s + +r.total, 0).toLocaleString()}</div>
          <div className="label">Collections (6 mo)</div>
        </div>
        <div className="stat">
          <div className="num">{(appts.completed || 0) + (appts.no_show || 0)}</div>
          <div className="label">Visits (30 d)</div>
        </div>
        <div className="stat">
          <div className="num">{data.noShowRate == null ? '—' : `${Math.round(data.noShowRate * 100)}%`}</div>
          <div className="label">No-show rate (90 d)</div>
        </div>
        <div className="stat">
          <div className="num">
            ${Number(data.claimsFunnel.filter(c => c.status !== 'funded').reduce((s, c) => s + +c.value, 0)).toLocaleString()}
          </div>
          <div className="label">Outstanding claim value</div>
        </div>
      </div>

      <div className="card">
        <h3>Revenue by month</h3>
        {data.revenueByMonth.map(r => <BarRow key={r.month} label={r.month} value={+r.total} max={revMax} money />)}
        {!data.revenueByMonth.length && <p className="muted">No payments yet.</p>}
      </div>

      <div className="card">
        <h3>Claims funnel ($ value by status)</h3>
        {data.claimsFunnel.map(c => (
          <BarRow key={c.status} label={`${c.status.replaceAll('_', ' ')} (${c.count})`} value={+c.value} max={claimMax} money />
        ))}
      </div>
    </>
  );
}
