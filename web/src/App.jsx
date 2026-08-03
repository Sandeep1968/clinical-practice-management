import { Routes, Route, Navigate, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Clients from './pages/Clients.jsx';
import PatientChart from './pages/PatientChart.jsx';
import Appointments from './pages/Appointments.jsx';
import ClaimTracker from './pages/ClaimTracker.jsx';
import Notes from './pages/Notes.jsx';
import Remittances from './pages/Remittances.jsx';
import Queue from './pages/Queue.jsx';
import Prescriptions from './pages/Prescriptions.jsx';
import Analytics from './pages/Analytics.jsx';
import Settings from './pages/Settings.jsx';
import Portal from './pages/Portal.jsx';
import { setToken } from './api.js';
import { Avatar } from './ui.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', icon: '⌂', end: true },
  { to: '/queue', label: 'Queue', icon: '⏱' },
  { to: '/clients', label: 'Patients', icon: '👥' },
  { to: '/appointments', label: 'Schedule', icon: '📅' },
  { to: '/notes', label: 'Notes', icon: '✎', roles: ['clinician'] },
  { to: '/prescriptions', label: 'Prescriptions', icon: '℞', roles: ['clinician'] },
  { to: '/claims', label: 'Claims', icon: '⛨', roles: ['owner', 'biller'] },
  { to: '/remittances', label: 'Remittances', icon: '💵', roles: ['owner', 'biller'] },
  { to: '/analytics', label: 'Analytics', icon: '📈', roles: ['owner', 'admin', 'biller'] },
  { to: '/settings', label: 'Settings', icon: '⚙' }
];

export default function App() {
  // a stored user without a stored token is a stale session — treat as logged out
  const [user, setUser] = useState(() =>
    localStorage.getItem('cpm_token') ? JSON.parse(localStorage.getItem('cpm_user') || 'null') : null);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  // Patient portal is a separate app surface with its own auth
  if (location.pathname.startsWith('/portal')) return <Portal />;

  const onLogin = (u) => {
    localStorage.setItem('cpm_user', JSON.stringify(u));
    setUser(u);
    navigate('/');
  };
  const logout = () => {
    setToken(null);
    localStorage.removeItem('cpm_user');
    setUser(null);
    navigate('/login');
  };
  const doSearch = (e) => {
    e.preventDefault();
    navigate(`/clients?q=${encodeURIComponent(search)}`);
  };

  if (!user) return <Routes><Route path="*" element={<Login onLogin={onLogin} />} /></Routes>;

  return (
    <div className="layout">
      <aside>
        <h1>ClinicOS</h1>
        <nav>
          {NAV.filter(n => !n.roles || n.roles.includes(user.role)).map(n => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              <span className="nav-icon">{n.icon}</span>{n.label}
            </NavLink>
          ))}
        </nav>
        <div className="user-box">
          <button onClick={logout}>Sign out</button>
        </div>
      </aside>
      <div className="main-col">
        <header className="topbar">
          <form onSubmit={doSearch} className="global-search">
            <input placeholder="Search patients…" value={search} onChange={e => setSearch(e.target.value)} />
          </form>
          <div className="topbar-user">
            <Avatar name={user.name} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{user.name}</div>
              <div className="muted" style={{ textTransform: 'capitalize' }}>{user.role.replaceAll('_', ' ')}</div>
            </div>
          </div>
        </header>
        <main>
          <Routes>
            <Route path="/" element={<Dashboard user={user} />} />
            <Route path="/clients" element={<Clients user={user} />} />
            <Route path="/patients/:id" element={<PatientChart user={user} />} />
            <Route path="/appointments" element={<Appointments user={user} />} />
            <Route path="/notes" element={<Notes />} />
            <Route path="/prescriptions" element={<Prescriptions />} />
            <Route path="/claims" element={<ClaimTracker user={user} />} />
            <Route path="/remittances" element={<Remittances />} />
            <Route path="/queue" element={<Queue />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/settings" element={<Settings user={user} />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
