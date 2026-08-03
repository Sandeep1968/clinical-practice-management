import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Avatar } from '../ui.jsx';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Scheduling({ user }) {
  const [tab, setTab] = useState('Availability');
  const [clinicians, setClinicians] = useState([]);
  const [clinicianId, setClinicianId] = useState('');
  const [rules, setRules] = useState([]);
  const [series, setSeries] = useState([]);
  const [waitlist, setWaitlist] = useState([]);
  const [clients, setClients] = useState([]);
  const [newSeries, setNewSeries] = useState({ clientId: '', weekday: 1, startTime: '10:00', cadence: 'weekly', occurrences: 12, startsOn: new Date().toISOString().slice(0, 10) });
  const [newWait, setNewWait] = useState({ clientId: '', preferredWeekdays: [], notes: '' });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api('/portal/clinicians').catch(() => {});
    api('/clients').then(r => setClients(r?.data || [])).catch(() => {});
    api('/scheduling/series').then(r => setSeries(r?.data || [])).catch(() => {});
    api('/scheduling/waitlist').then(r => setWaitlist(r?.data || [])).catch(() => {});
    // clinician list comes from the staff side
    api('/clients').then(() => {}).catch(() => {});
  }, []);

  useEffect(() => {
    if (clinicianId) api(`/scheduling/availability/${clinicianId}`).then(r => setRules(r?.rules || [])).catch(() => {});
  }, [clinicianId]);

  const loadAll = () => {
    api('/scheduling/series').then(r => setSeries(r?.data || [])).catch(() => {});
    api('/scheduling/waitlist').then(r => setWaitlist(r?.data || [])).catch(() => {});
  };

  const setRule = (wd, patch) => {
    setRules(rs => {
      const found = rs.find(r => r.weekday === wd);
      if (found) return rs.map(r => r.weekday === wd ? { ...r, ...patch } : r);
      return [...rs, { weekday: wd, start_time: '09:00', end_time: '17:00', slot_minutes: 50, accepts_new: true, ...patch }];
    });
  };
  const removeRule = (wd) => setRules(rs => rs.filter(r => r.weekday !== wd));

  const saveAvailability = async () => {
    setMsg('');
    try {
      await api(`/scheduling/availability/${clinicianId}`, {
        method: 'PUT',
        body: {
          rules: rules.map(r => ({
            weekday: r.weekday, startTime: (r.start_time || '').slice(0, 5),
            endTime: (r.end_time || '').slice(0, 5), slotMinutes: r.slot_minutes, acceptsNew: r.accepts_new
          }))
        }
      });
      setMsg('Availability saved — patients can now self-book these hours.');
    } catch (err) { setMsg(err.message); }
  };

  const createSeries = async (e) => {
    e.preventDefault(); setMsg('');
    try {
      const r = await api('/scheduling/series', { method: 'POST', body: { ...newSeries, clinicianId } });
      setMsg(`Created ${r.created} recurring appointments${r.skipped ? `, ${r.skipped} skipped for conflicts` : ''}.`);
      loadAll();
    } catch (err) { setMsg(err.message); }
  };

  const endSeries = async (id) => { await api(`/scheduling/series/${id}`, { method: 'DELETE' }); loadAll(); };

  const addWait = async (e) => {
    e.preventDefault(); setMsg('');
    try { await api('/scheduling/waitlist', { method: 'POST', body: { ...newWait, clinicianId: clinicianId || null } });
      setNewWait({ clientId: '', preferredWeekdays: [], notes: '' }); loadAll(); }
    catch (err) { setMsg(err.message); }
  };

  const setWaitStatus = async (id, status) => {
    await api(`/scheduling/waitlist/${id}`, { method: 'PATCH', body: { status } }); loadAll();
  };

  return (
    <>
      <h2>Scheduling</h2>
      <div className="tabs">
        {['Availability', 'Recurring', 'Waitlist'].map(t => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {user.role === 'clinician' && !clinicianId && (
        <div className="card"><p className="muted">Loading your provider profile… if this persists, ask an admin to link your clinician record.</p></div>
      )}

      <div className="card">
        <div className="row" style={{ marginBottom: 0 }}>
          <label className="muted">Clinician ID
            <input value={clinicianId} onChange={e => setClinicianId(e.target.value)}
                   placeholder="paste clinician id" style={{ marginLeft: 8, width: 320 }} />
          </label>
          <span className="muted">Demo: 33333333-3333-3333-3333-333333333331</span>
        </div>
      </div>

      {tab === 'Availability' && clinicianId && (
        <div className="card">
          <div className="card-head">
            <h3>Weekly working hours</h3>
            <button className="primary" onClick={saveAvailability}>Save</button>
          </div>
          <table>
            <thead><tr><th>Day</th><th>Available</th><th>From</th><th>To</th><th>Slot (min)</th><th>New patients</th></tr></thead>
            <tbody>
              {DAYS.map((d, wd) => {
                const rule = rules.find(r => r.weekday === wd);
                return (
                  <tr key={wd}>
                    <td><b>{d}</b></td>
                    <td>
                      <input type="checkbox" checked={!!rule}
                             onChange={e => e.target.checked ? setRule(wd, {}) : removeRule(wd)} />
                    </td>
                    <td>{rule && <input type="time" value={(rule.start_time || '').slice(0, 5)}
                                        onChange={e => setRule(wd, { start_time: e.target.value })} />}</td>
                    <td>{rule && <input type="time" value={(rule.end_time || '').slice(0, 5)}
                                        onChange={e => setRule(wd, { end_time: e.target.value })} />}</td>
                    <td>{rule && <input type="number" min="15" step="5" value={rule.slot_minutes} style={{ width: 70 }}
                                        onChange={e => setRule(wd, { slot_minutes: +e.target.value })} />}</td>
                    <td>{rule && <input type="checkbox" checked={rule.accepts_new !== false}
                                        onChange={e => setRule(wd, { accepts_new: e.target.checked })} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="muted" style={{ marginTop: 12 }}>
            These hours drive patient self-booking in the portal — patients can only pick slots that are open here.
          </p>
        </div>
      )}

      {tab === 'Recurring' && (
        <>
          <form className="card" onSubmit={createSeries}>
            <h3>New recurring series (weekly therapy slot)</h3>
            <div className="row">
              <select value={newSeries.clientId} required
                      onChange={e => setNewSeries({ ...newSeries, clientId: e.target.value })}>
                <option value="">Select patient…</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.last_name}, {c.first_name}</option>)}
              </select>
              <select value={newSeries.weekday} onChange={e => setNewSeries({ ...newSeries, weekday: +e.target.value })}>
                {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
              <input type="time" value={newSeries.startTime}
                     onChange={e => setNewSeries({ ...newSeries, startTime: e.target.value })} />
              <select value={newSeries.cadence} onChange={e => setNewSeries({ ...newSeries, cadence: e.target.value })}>
                <option value="weekly">Weekly</option><option value="biweekly">Biweekly</option>
              </select>
              <input type="number" min="1" max="52" value={newSeries.occurrences} style={{ width: 80 }}
                     onChange={e => setNewSeries({ ...newSeries, occurrences: +e.target.value })} title="occurrences" />
              <button className="primary" disabled={!clinicianId}>Create series</button>
            </div>
          </form>
          <div className="card">
            <h3>Active series</h3>
            <table>
              <thead><tr><th>Patient</th><th>When</th><th>Cadence</th><th>Upcoming</th><th></th></tr></thead>
              <tbody>
                {series.map(s => (
                  <tr key={s.id}>
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar name={s.client_name} size={30} /><b>{s.client_name}</b>
                      </span>
                    </td>
                    <td>{DAYS[s.weekday]} at {(s.start_time || '').slice(0, 5)}</td>
                    <td className="muted">{s.cadence}</td>
                    <td>{s.upcoming}</td>
                    <td><button onClick={() => endSeries(s.id)}>end series</button></td>
                  </tr>
                ))}
                {!series.length && <tr><td colSpan="5" className="muted">No recurring appointments.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'Waitlist' && (
        <>
          <form className="card" onSubmit={addWait}>
            <h3>Add to waitlist</h3>
            <div className="row" style={{ marginBottom: 0 }}>
              <select value={newWait.clientId} required onChange={e => setNewWait({ ...newWait, clientId: e.target.value })}>
                <option value="">Select patient…</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.last_name}, {c.first_name}</option>)}
              </select>
              {DAYS.map((d, i) => (
                <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                  <input type="checkbox" checked={newWait.preferredWeekdays.includes(i)}
                         onChange={e => setNewWait({
                           ...newWait,
                           preferredWeekdays: e.target.checked
                             ? [...newWait.preferredWeekdays, i]
                             : newWait.preferredWeekdays.filter(x => x !== i)
                         })} />{d}
                </label>
              ))}
              <button className="primary">Add</button>
            </div>
          </form>
          <div className="card">
            <h3>Waiting</h3>
            <table>
              <thead><tr><th>Patient</th><th>Prefers</th><th>Provider</th><th>Waiting since</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {waitlist.map(w => (
                  <tr key={w.id}>
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar name={w.client_name} size={30} /><b>{w.client_name}</b>
                      </span>
                    </td>
                    <td className="muted">{(w.preferred_weekdays || []).map(d => DAYS[d]).join(', ') || 'any day'}</td>
                    <td className="muted">{w.clinician_name || 'any'}</td>
                    <td className="muted">{new Date(w.created_at).toLocaleDateString()}</td>
                    <td><span className={`badge ${w.status === 'offered' ? 'in_revision' : 'draft'}`}>{w.status}</span></td>
                    <td>
                      <button onClick={() => setWaitStatus(w.id, 'offered')} style={{ marginRight: 6 }}>offer slot</button>
                      <button onClick={() => setWaitStatus(w.id, 'removed')}>remove</button>
                    </td>
                  </tr>
                ))}
                {!waitlist.length && <tr><td colSpan="6" className="muted">Waitlist is empty.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
      {msg && <p className="muted">{msg}</p>}
    </>
  );
}
