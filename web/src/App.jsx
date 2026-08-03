import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Clients from './pages/Clients.jsx';
import Appointments from './pages/Appointments.jsx';
import ClaimTracker from './pages/ClaimTracker.jsx';
import Notes from './pages/Notes.jsx';
import Remittances from './pages/Remittances.jsx';
import Queue from './pages/Queue.jsx';
import Prescriptions from './pages/Prescriptions.jsx';
import Analytics from './pages/Analytics.jsx';
import Settings from './pages/Settings.jsx';
import { setToken } from './api.js';

export default function App() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('cpm_user') || 'null'));
  const navigate = useNavigate();

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

  if (!user) return <Routes><Route path="*" element={<Login onLogin={onLogin} />} /></Routes>;

  return (
    <div className="layout">
      <aside>
        <h1>ClinicOS</h1>
        <nav>
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/queue">Queue</NavLink>
          <NavLink to="/clients">Patients</NavLink>
          <NavLink to="/appointments">Schedule</NavLink>
          {user.role === 'clinician' && <NavLink to="/notes">Notes</NavLink>}
          {user.role === 'clinician' && <NavLink to="/prescriptions">Prescriptions</NavLink>}
          {['owner', 'admin', 'biller'].includes(user.role) && <NavLink to="/analytics">Analytics</NavLink>}
          <NavLink to="/settings">Settings</NavLink>
          {['owner', 'biller'].includes(user.role) && <NavLink to="/claims">Claim Tracker</NavLink>}
          {['owner', 'biller'].includes(user.role) && <NavLink to="/remittances">Remittances</NavLink>}
        </nav>
        <div className="user-box">
          <div>{user.name}</div>
          <small>{user.role}</small>
          <button onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard user={user} />} />
          <Route path="/clients" element={<Clients user={user} />} />
          <Route path="/appointments" element={<Appointments user={user} />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/claims" element={<ClaimTracker user={user} />} />
          <Route path="/remittances" element={<Remittances />} />
          <Route path="/queue" element={<Queue />} />
          <Route path="/prescriptions" element={<Prescriptions />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<Settings user={user} />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}
