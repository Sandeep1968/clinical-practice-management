import { useEffect, useState } from 'react';
import { api } from '../api.js';

const NEXT = {
  booked: ['confirmed', 'cancelled'],
  confirmed: ['arrived', 'no_show', 'cancelled'],
  arrived: ['completed'],
};

export default function Appointments() {
  const [appts, setAppts] = useState([]);

  const load = () => api('/appointments').then(r => setAppts(r?.data || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const setStatus = async (id, status) => {
    await api(`/appointments/${id}/status`, { method: 'PATCH', body: { status } });
    load();
  };

  return (
    <>
      <h2>Schedule (next 7 days)</h2>
      <div className="card">
        <table>
          <thead><tr><th>When</th><th>Client</th><th>Type</th><th>Location</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {appts.map(a => (
              <tr key={a.id}>
                <td>{new Date(a.starts_at).toLocaleString()}</td>
                <td>{a.first_name} {a.last_name}</td>
                <td>{a.appt_type}</td>
                <td>{a.location}</td>
                <td><span className={`badge ${a.status}`}>{a.status}</span></td>
                <td>
                  {(NEXT[a.status] || []).map(s => (
                    <button key={s} onClick={() => setStatus(a.id, s)} style={{ marginRight: 6 }}>{s}</button>
                  ))}
                </td>
              </tr>
            ))}
            {!appts.length && <tr><td colSpan="6">No appointments in the next 7 days.</td></tr>}
          </tbody>
        </table>
      </div>
      <p style={{ color: '#667085', fontSize: 13 }}>
        Marking an appointment <b>completed</b> automatically opens an encounter in the clinician's
        unsigned-notes queue — the start of the notes → billing → claim pipeline.
      </p>
    </>
  );
}
