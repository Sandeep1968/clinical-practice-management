const PALETTE = ['#5a4fcf', '#1f9d63', '#c98314', '#d64550', '#2b8ac9', '#8d4fc9', '#c94f8a'];

export function Avatar({ name = '?', size = 36 }) {
  const initials = name.split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  const color = PALETTE[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
  return (
    <span className="avatar" style={{
      width: size, height: size, fontSize: size * 0.38,
      background: color + '1a', color
    }}>{initials || '?'}</span>
  );
}

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
