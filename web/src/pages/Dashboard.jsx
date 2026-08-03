import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Dashboard({ user }) {
  const [appts, setAppts] = useState([]);
  const [unsigned, setUnsigned] = useState([]);
  const [aging, setAging] = useState([]);

  useEffect(() => {
    api('/appointments').then(r => setAppts(r?.data || [])).catch(() => {});
    api('/encounters/unsigned').then(r => setUnsigned(r?.data || [])).catch(() => {});
    if (['owner', 'biller'].includes(user.role))
      api('/claims/reports/aging').then(r => setAging(r?.data || [])).catch(() => {});
  }, [user.role]);

  return (
    <>
      <h2>Dashboard</h2>
      <div className="stat-grid">
        <div className="stat"><div className="num">{appts.length}</div><div className="label">Upcoming appointments (7d)</div></div>
        <div className="stat"><div className="num">{unsigned.length}</div><div className="label">Unsigned notes</div></div>
        {aging.map(a => (
          <div className="stat" key={a.status}>
            <div className="num">${Number(a.total).toLocaleString()}</div>
            <div className="label">{a.status.replaceAll('_', ' ')} · {a.count} claims · avg {a.avg_age_days}d</div>
          </div>
        ))}
      </div>
      <div className="card">
        <h3>Next appointments</h3>
        <table>
          <thead><tr><th>When</th><th>Client</th><th>Type</th><th>Status</th></tr></thead>
          <tbody>
            {appts.slice(0, 8).map(a => (
              <tr key={a.id}>
                <td>{new Date(a.starts_at).toLocaleString()}</td>
                <td>{a.first_name} {a.last_name}</td>
                <td>{a.appt_type}</td>
                <td><span className={`badge ${a.status}`}>{a.status}</span></td>
              </tr>
            ))}
            {!appts.length && <tr><td colSpan="4">No upcoming appointments.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
