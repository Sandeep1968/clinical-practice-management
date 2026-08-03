import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from './api.js';

export default function NotificationBell() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const load = () => api('/notifications')
    .then(r => { setItems(r?.data || []); setUnread(r?.unread || 0); })
    .catch(() => {});

  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);

  const go = async (n) => {
    await api(`/notifications/${n.id}/read`, { method: 'POST' }).catch(() => {});
    setOpen(false);
    if (n.link) navigate(n.link);
    load();
  };

  const markAll = async () => { await api('/notifications/read-all', { method: 'POST' }); load(); };

  return (
    <div className="bell-wrap">
      <button className="bell" onClick={() => setOpen(o => !o)} title="Notifications">
        🔔{unread > 0 && <span className="bell-dot">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="bell-panel card">
          <div className="card-head">
            <h3>Notifications</h3>
            {unread > 0 && <button onClick={markAll} style={{ padding: '3px 10px', fontSize: 12 }}>Mark all read</button>}
          </div>
          <div className="people-list">
            {items.map(n => (
              <div className="person-row" key={n.id} style={{ cursor: 'pointer', opacity: n.read_at ? .55 : 1 }}
                   onClick={() => go(n)}>
                <span className={`badge ${n.kind === 'claim' ? 'submitted' : n.kind === 'message' ? 'in_revision' : 'draft'}`}>
                  {n.kind}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{n.title}</div>
                  <div className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {n.body}
                  </div>
                </div>
                <span className="muted" style={{ fontSize: 11 }}>
                  {new Date(n.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
            {!items.length && <p className="muted">Nothing new.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
