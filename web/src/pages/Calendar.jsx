import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOUR_START = 7, HOUR_END = 20;

const startOfWeek = (d) => { const x = new Date(d); x.setDate(x.getDate() - x.getDay()); x.setHours(0,0,0,0); return x; };
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const sameDay = (a, b) => a.toDateString() === b.toDateString();
const fmtTime = (d) => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export default function Calendar() {
  const [view, setView] = useState('week');
  const [anchor, setAnchor] = useState(new Date());
  const [appts, setAppts] = useState([]);
  const [sel, setSel] = useState(null);

  const range = useMemo(() => {
    if (view === 'day') { const s = new Date(anchor); s.setHours(0,0,0,0); return [s, new Date(s.getTime() + 864e5)]; }
    if (view === 'week') { const s = startOfWeek(anchor); return [s, new Date(s.getTime() + 7 * 864e5)]; }
    const s = startOfMonth(anchor);
    const gridStart = startOfWeek(s);
    return [gridStart, new Date(gridStart.getTime() + 42 * 864e5)];
  }, [view, anchor]);

  useEffect(() => {
    api(`/appointments?from=${range[0].toISOString()}&to=${range[1].toISOString()}`)
      .then(r => setAppts(r?.data || [])).catch(() => {});
  }, [range]);

  const move = (dir) => {
    const d = new Date(anchor);
    if (view === 'day') d.setDate(d.getDate() + dir);
    else if (view === 'week') d.setDate(d.getDate() + 7 * dir);
    else d.setMonth(d.getMonth() + dir);
    setAnchor(d);
  };

  const label = view === 'month'
    ? anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : view === 'week'
      ? `${range[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${new Date(range[1] - 864e5).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
      : anchor.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const forDay = (d) => appts.filter(a => sameDay(new Date(a.starts_at), d));

  const setStatus = async (id, status) => {
    await api(`/appointments/${id}/status`, { method: 'PATCH', body: { status } });
    setSel(null);
    api(`/appointments?from=${range[0].toISOString()}&to=${range[1].toISOString()}`)
      .then(r => setAppts(r?.data || []));
  };

  const Event = ({ a, style }) => (
    <div className={`cal-event ${a.status}`} style={style} onClick={() => setSel(a)} title={`${a.first_name} ${a.last_name}`}>
      <b>{fmtTime(a.starts_at)}</b> {a.first_name} {a.last_name?.[0]}.
    </div>
  );

  return (
    <>
      <div className="hero">
        <h2 style={{ margin: 0 }}>Calendar</h2>
        <div className="row" style={{ margin: 0 }}>
          <button onClick={() => setAnchor(new Date())}>Today</button>
          <button onClick={() => move(-1)}>‹</button>
          <button onClick={() => move(1)}>›</button>
          <div className="tabs" style={{ border: 'none', margin: 0 }}>
            {['day', 'week', 'month'].map(v => (
              <button key={v} className={`tab ${view === v ? 'active' : ''}`} onClick={() => setView(v)}>
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="muted" style={{ marginTop: -8 }}>{label}</p>

      {view === 'month' && (
        <div className="card" style={{ padding: 12 }}>
          <div className="cal-month-head">{DAYS.map(d => <div key={d}>{d}</div>)}</div>
          <div className="cal-month">
            {Array.from({ length: 42 }, (_, i) => {
              const d = new Date(range[0].getTime() + i * 864e5);
              const dim = d.getMonth() !== anchor.getMonth();
              return (
                <div className={`cal-cell ${dim ? 'dim' : ''} ${sameDay(d, new Date()) ? 'today' : ''}`} key={i}>
                  <div className="cal-date">{d.getDate()}</div>
                  {forDay(d).slice(0, 3).map(a => <Event a={a} key={a.id} />)}
                  {forDay(d).length > 3 && <div className="muted" style={{ fontSize: 11 }}>+{forDay(d).length - 3} more</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(view === 'week' || view === 'day') && (
        <div className="card" style={{ padding: 12, overflowX: 'auto' }}>
          <div className={`cal-grid ${view}`}>
            <div className="cal-gutter">
              {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
                <div className="cal-hour" key={i}>
                  <span>{((HOUR_START + i) % 12) || 12}{HOUR_START + i < 12 ? 'am' : 'pm'}</span>
                </div>
              ))}
            </div>
            {Array.from({ length: view === 'week' ? 7 : 1 }, (_, di) => {
              const d = new Date(range[0].getTime() + di * 864e5);
              return (
                <div className="cal-col" key={di}>
                  <div className={`cal-col-head ${sameDay(d, new Date()) ? 'today' : ''}`}>
                    {DAYS[d.getDay()]} <b>{d.getDate()}</b>
                  </div>
                  <div className="cal-col-body">
                    {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => <div className="cal-slot" key={i} />)}
                    {forDay(d).map(a => {
                      const s = new Date(a.starts_at), e = new Date(a.ends_at);
                      const top = ((s.getHours() + s.getMinutes() / 60) - HOUR_START) * 48;
                      const h = Math.max(((e - s) / 3600000) * 48, 22);
                      if (top < 0) return null;
                      return <Event a={a} key={a.id} style={{ position: 'absolute', top, height: h, left: 3, right: 3 }} />;
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {sel && (
        <div className="card">
          <div className="card-head">
            <h3>{sel.first_name} {sel.last_name}</h3>
            <span className={`badge ${sel.status}`}>{sel.status.replaceAll('_', ' ')}</span>
          </div>
          <p className="muted">
            {new Date(sel.starts_at).toLocaleString()} – {fmtTime(sel.ends_at)} · {sel.appt_type} · {sel.location}
          </p>
          <div className="row" style={{ marginBottom: 0 }}>
            {['confirmed', 'arrived', 'completed', 'no_show', 'cancelled'].map(s => (
              <button key={s} onClick={() => setStatus(sel.id, s)}>{s.replaceAll('_', ' ')}</button>
            ))}
            <button onClick={() => setSel(null)}>close</button>
          </div>
        </div>
      )}
    </>
  );
}
