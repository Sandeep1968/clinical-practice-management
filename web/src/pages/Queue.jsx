import { useEffect, useState } from 'react';
import { api } from '../api.js';

const STEP = { booked: 'confirmed', confirmed: 'arrived', arrived: 'completed' };
const LABEL = { booked: 'Confirm', confirmed: 'Check in', arrived: 'Complete visit' };

export default function Queue() {
  const [appts, setAppts] = useState([]);

  const load = () => {
    const from = new Date(); from.setHours(0, 0, 0, 0);
    const to = new Date(); to.setHours(23, 59, 59, 999);
    api(`/appointments?from=${from.toISOString()}&to=${to.toISOString()}`)
      .then(r => setAppts(r?.data || [])).catch(() => {});
  };
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);

  const advance = async (a) => {
    await api(`/appointments/${a.id}/status`, { method: 'PATCH', body: { status: STEP[a.status] } });
    load();
  };
  const noShow = async (a) => {
    await api(`/appointments/${a.id}/status`, { method: 'PATCH', body: { status: 'no_show' } });
    load();
  };

  const waiting = appts.filter(a => a.status === 'arrived');
  const upcoming = appts.filter(a => ['booked', 'confirmed'].includes(a.status));
  const done = appts.filter(a => ['completed', 'no_show', 'cancelled'].includes(a.status));

  const QueueTable = ({ rows, actions }) => (
    <table>
      <thead><tr><th>Time</th><th>Patient</th><th>Type</th><th>Status</th>{actions && <th>Action</th>}</tr></thead>
      <tbody>
        {rows.map(a => (
          <tr key={a.id}>
            <td>{new Date(a.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
            <td>{a.first_name} {a.last_name}</td>
            <td>{a.appt_type}</td>
            <td><span className={`badge ${a.status}`}>{a.status.replaceAll('_', ' ')}</span></td>
            {actions && (
              <td>
                {STEP[a.status] && <button className="primary" style={{ padding: '4px 10px', marginRight: 6 }} onClick={() => advance(a)}>{LABEL[a.status]}</button>}
                {['booked', 'confirmed'].includes(a.status) && <button onClick={() => noShow(a)}>no-show</button>}
              </td>
            )}
          </tr>
        ))}
        {!rows.length && <tr><td colSpan="5" className="muted">Empty</td></tr>}
      </tbody>
    </table>
  );

  return (
    <>
      <h2>Today's Queue</h2>
      <div className="stat-grid">
        <div className="stat"><div className="num">{waiting.length}</div><div className="label">In waiting room</div></div>
        <div className="stat"><div className="num">{upcoming.length}</div><div className="label">Upcoming today</div></div>
        <div className="stat"><div className="num">{done.filter(a => a.status === 'completed').length}</div><div className="label">Seen today</div></div>
      </div>
      <div className="card"><h3>Waiting</h3><QueueTable rows={waiting} actions /></div>
      <div className="card"><h3>Upcoming</h3><QueueTable rows={upcoming} actions /></div>
      <div className="card"><h3>Finished</h3><QueueTable rows={done} /></div>
    </>
  );
}
