import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Avatar, greeting } from '../ui.jsx';

const MODULES = [
  { n: 1, title: 'Digital Prescription', desc: 'Write & share Rx in seconds', to: '/prescriptions', roles: ['clinician'] },
  { n: 2, title: 'Clinic Management', desc: 'Queue, billing & more', to: '/queue' },
  { n: 3, title: 'Patient Engagement', desc: 'Reminders & follow-ups', to: '/settings' },
  { n: 4, title: 'Practice Analytics', desc: 'Revenue & trend insights', to: '/analytics', roles: ['owner', 'admin', 'biller'] },
  { n: 5, title: 'Multi-Login Setup', desc: 'Multi-doctor & staff access', to: '/settings' },
  { n: 6, title: 'AI Scribe', desc: 'AI-drafted clinical notes', to: '/notes', roles: ['clinician'] }
];

export default function Dashboard({ user }) {
  const [appts, setAppts] = useState([]);
  const [unsigned, setUnsigned] = useState([]);
  const [aging, setAging] = useState([]);

  useEffect(() => {
    const from = new Date(); from.setHours(0, 0, 0, 0);
    const to = new Date(from.getTime() + 7 * 864e5);
    api(`/appointments?from=${from.toISOString()}&to=${to.toISOString()}`)
      .then(r => setAppts(r?.data || [])).catch(() => {});
    api('/encounters/unsigned').then(r => setUnsigned(r?.data || [])).catch(() => {});
    if (['owner', 'biller'].includes(user.role))
      api('/claims/reports/aging').then(r => setAging(r?.data || [])).catch(() => {});
  }, [user.role]);

  const today = appts.filter(a => new Date(a.starts_at).toDateString() === new Date().toDateString());
  const outstanding = aging.reduce((s, a) => s + +a.total, 0);

  return (
    <>
      <div className="hero-banner">
        <h2>{greeting()}, {user.name.split(' ')[0]} 👋</h2>
        <p className="muted" style={{ margin: 0 }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} — your clinic at a glance
        </p>
      </div>

      <div className="stat-grid">
        <div className="stat grad-purple">
          <div className="num">{today.length}</div><div className="label">Appointments today</div>
        </div>
        <div className="stat grad-green">
          <div className="num">{appts.length}</div><div className="label">Next 7 days</div>
        </div>
        <div className="stat grad-amber">
          <div className="num">{unsigned.length}</div><div className="label">Unsigned notes</div>
        </div>
        {aging.length > 0 && (
          <div className="stat grad-red">
            <div className="num">${outstanding.toLocaleString()}</div><div className="label">Outstanding claims</div>
          </div>
        )}
      </div>

      <div className="section-head">
        <h3 style={{ margin: '4px 0 2px' }}>360° Practice Management</h3>
        <p className="muted" style={{ margin: '0 0 12px' }}>
          One clinic software for prescriptions, appointments, patient engagement, and analytics.
        </p>
      </div>
      <div className="feature-grid">
        {MODULES.filter(m => !m.roles || m.roles.includes(user.role)).map(m => (
          <Link to={m.to} className="feature-card" key={m.n}>
            <span className="feature-num">{m.n}</span>
            <div>
              <div className="feature-title">{m.title}</div>
              <div className="muted">{m.desc}</div>
            </div>
            <span className="feature-arrow">→</span>
          </Link>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Today's patients</h3>
          <Link to="/queue" className="muted">Open queue →</Link>
        </div>
        {today.length === 0 && <p className="muted">No appointments today.</p>}
        <div className="people-list">
          {today.map(a => (
            <div className="person-row" key={a.id}>
              <Avatar name={`${a.first_name} ${a.last_name}`} size={40} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{a.first_name} {a.last_name}</div>
                <div className="muted">{new Date(a.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {a.appt_type} · {a.location}</div>
              </div>
              <span className={`badge ${a.status}`}>{a.status.replaceAll('_', ' ')}</span>
            </div>
          ))}
        </div>
      </div>

      {unsigned.length > 0 && user.role === 'clinician' && (
        <div className="card">
          <div className="card-head">
            <h3>Pending documentation</h3>
            <Link to="/notes" className="muted">Open notes →</Link>
          </div>
          <div className="people-list">
            {unsigned.slice(0, 5).map(e => (
              <div className="person-row" key={e.id}>
                <Avatar name={`${e.first_name} ${e.last_name}`} size={40} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{e.first_name} {e.last_name}</div>
                  <div className="muted">Visit on {new Date(e.dos).toLocaleDateString()}</div>
                </div>
                <span className="badge in_revision">unsigned</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
