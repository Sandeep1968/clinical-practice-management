const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

let accessToken = localStorage.getItem('cpm_token');

export function setToken(t) {
  accessToken = t;
  if (t) localStorage.setItem('cpm_token', t);
  else localStorage.removeItem('cpm_token');
}

export async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...opts.headers
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (res.status === 401) {
    // clear the whole session (token AND user) so the app doesn't loop
    setToken(null);
    localStorage.removeItem('cpm_user');
    if (!window.location.pathname.startsWith('/login')) window.location.href = '/login';
    return new Promise(() => {});  // halt callers during redirect
  }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  return res.json();
}
