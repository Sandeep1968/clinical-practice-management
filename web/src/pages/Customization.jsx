import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Customization({ user }) {
  const [tab, setTab] = useState('Branding');
  const [b, setB] = useState({});
  const [templates, setTemplates] = useState([]);
  const [nt, setNt] = useState({ scope: 'note', name: '', specialty: '', sections: 'Subjective, Objective, Assessment, Plan' });
  const [msg, setMsg] = useState('');
  const canEdit = ['owner', 'admin'].includes(user.role);

  const load = () => {
    api('/customization/branding').then(setB).catch(() => {});
    api('/customization/templates').then(r => setTemplates(r?.data || [])).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const saveBranding = async (e) => {
    e.preventDefault(); setMsg('');
    try {
      await api('/customization/branding', {
        method: 'PUT',
        body: {
          displayName: b.display_name, logoUrl: b.logo_url, primaryColor: b.primary_color,
          rxHeader: b.rx_header, rxFooter: b.rx_footer, portalWelcome: b.portal_welcome, timezone: b.timezone
        }
      });
      setMsg('Branding saved. It appears on printed prescriptions and the patient portal.');
    } catch (err) { setMsg(err.message); }
  };

  const addTemplate = async (e) => {
    e.preventDefault(); setMsg('');
    try {
      const body = nt.scope === 'note'
        ? { sections: nt.sections.split(',').map(s => s.trim()).filter(Boolean) }
        : { goals: [] };
      await api('/customization/templates', { method: 'POST', body: { scope: nt.scope, name: nt.name, specialty: nt.specialty, body } });
      setNt({ ...nt, name: '', specialty: '' }); load();
    } catch (err) { setMsg(err.message); }
  };

  const remove = async (id) => { await api(`/customization/templates/${id}`, { method: 'DELETE' }); load(); };

  return (
    <>
      <h2>Customization</h2>
      <div className="tabs">
        {['Branding', 'Templates'].map(t => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === 'Branding' && (
        <form className="card" onSubmit={saveBranding}>
          <h3>Practice branding</h3>
          <div className="row">
            <label className="muted" style={{ flex: 1 }}>Display name
              <input value={b.display_name || ''} onChange={e => setB({ ...b, display_name: e.target.value })}
                     style={{ width: '100%' }} disabled={!canEdit} />
            </label>
            <label className="muted">Primary color
              <input type="color" value={b.primary_color || '#2563EB'} disabled={!canEdit}
                     onChange={e => setB({ ...b, primary_color: e.target.value })} style={{ width: 60, padding: 4 }} />
            </label>
          </div>
          <label className="muted">Logo URL
            <input value={b.logo_url || ''} onChange={e => setB({ ...b, logo_url: e.target.value })}
                   placeholder="https://…" style={{ width: '100%' }} disabled={!canEdit} />
          </label>
          <label className="muted">Prescription header (address & phone)
            <input value={b.rx_header || ''} onChange={e => setB({ ...b, rx_header: e.target.value })}
                   style={{ width: '100%' }} disabled={!canEdit} />
          </label>
          <label className="muted">Prescription footer (license / disclaimers)
            <input value={b.rx_footer || ''} onChange={e => setB({ ...b, rx_footer: e.target.value })}
                   style={{ width: '100%' }} disabled={!canEdit} />
          </label>
          <label className="muted">Patient portal welcome message
            <textarea rows={3} value={b.portal_welcome || ''} disabled={!canEdit}
                      onChange={e => setB({ ...b, portal_welcome: e.target.value })} style={{ width: '100%' }} />
          </label>
          {canEdit && <button className="primary" style={{ marginTop: 12 }}>Save branding</button>}
        </form>
      )}

      {tab === 'Templates' && (
        <>
          <div className="card">
            <h3>Template library</h3>
            <table>
              <thead><tr><th>Name</th><th>Scope</th><th>Specialty</th><th>Structure</th><th></th></tr></thead>
              <tbody>
                {templates.map(t => (
                  <tr key={t.id}>
                    <td><b>{t.name}</b></td>
                    <td><span className="badge submitted">{t.scope}</span></td>
                    <td className="muted">{t.specialty || '—'}</td>
                    <td className="muted">
                      {t.scope === 'note'
                        ? (t.body.sections || []).join(' · ')
                        : `${(t.body.goals || []).length} starter goal(s)`}
                    </td>
                    <td>{canEdit && <button onClick={() => remove(t.id)}>remove</button>}</td>
                  </tr>
                ))}
                {!templates.length && <tr><td colSpan="5" className="muted">No templates.</td></tr>}
              </tbody>
            </table>
          </div>

          <form className="card" onSubmit={addTemplate}>
            <h3>Add a template</h3>
            <div className="row">
              <select value={nt.scope} onChange={e => setNt({ ...nt, scope: e.target.value })}>
                <option value="note">Progress note</option>
                <option value="plan">Treatment plan</option>
              </select>
              <input placeholder="Template name" value={nt.name} required
                     onChange={e => setNt({ ...nt, name: e.target.value })} style={{ flex: 1 }} />
              <input placeholder="Specialty (optional)" value={nt.specialty}
                     onChange={e => setNt({ ...nt, specialty: e.target.value })} />
            </div>
            {nt.scope === 'note' && (
              <input placeholder="Sections, comma separated" value={nt.sections}
                     onChange={e => setNt({ ...nt, sections: e.target.value })} style={{ width: '100%', marginBottom: 12 }} />
            )}
            <button className="primary">Add template</button>
          </form>
        </>
      )}
      {msg && <p className="muted">{msg}</p>}
    </>
  );
}
