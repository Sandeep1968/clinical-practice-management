import { useEffect, useState } from 'react';
import { BASE } from './api.js';

/**
 * Shown only when the API reports DEMO_MODE.
 * A public demo must never be mistaken for a live clinical system — and no
 * real patient data belongs on it (no BAA, no encryption at rest).
 */
export default function DemoBanner() {
  const [demo, setDemo] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    fetch(`${BASE}/health`)
      .then(r => r.json())
      .then(d => setDemo(!!d.demo))
      .catch(() => {});
  }, []);

  if (!demo || hidden) return null;

  return (
    <div className="demo-banner">
      <b>Demo environment</b>
      <span>Sample data only — do not enter real patient information.</span>
      <button onClick={() => setHidden(true)} aria-label="Dismiss">×</button>
    </div>
  );
}
