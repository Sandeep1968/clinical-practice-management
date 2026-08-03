import { useState } from 'react';
import { Link } from 'react-router-dom';

const MODULES = [
  { n: 1, title: 'Digital Prescription', sub: 'Write & share Rx in seconds', heading: 'Write and share smart digital prescriptions, fast.', points: ['Customized prescription pad with ICD-10 coded diagnoses', 'Structured medications — strength, frequency, duration', 'Brand your printed Rx your way'] },
  { n: 2, title: 'Clinic Management', sub: 'Queue, billing & more', heading: 'Manage your clinic effectively & successfully.', points: ['Manage walk-ins & appointments in a single queue', 'Automated SMS follow-up reminders', 'Easily manage billing, claims & due payments'] },
  { n: 3, title: 'Patient Engagement', sub: 'Reminders & portal', heading: 'Stay connected with your patients, always.', points: ['Automated reminders for bookings (TCPA consent-gated)', 'Patient portal — visits, prescriptions, bills, self-booking', 'Digital prescriptions shared instantly'] },
  { n: 4, title: 'Practice Analytics', sub: 'Revenue & trend insights', heading: 'Get comprehensive analytics for your practice.', points: ['Real-time revenue & appointment insights', 'Claims funnel with payout visibility', 'No-show and utilization trends'] },
  { n: 5, title: 'Multi-Login Setup', sub: 'Multi-doctor & staff access', heading: 'Set up multiple doctors & staff with one clinic account.', points: ['Owner, admin, clinician, biller & front-desk roles', 'Each staff member sees only what they need to', 'Clinician data isolation enforced in the database'] },
  { n: 6, title: 'AI Scribe', sub: 'AI clinical notes', heading: 'Let AI write the note while you focus on the patient.', points: ['AI-drafted SOAP / DAP / BIRP notes', 'Clinician reviews, edits & signs — signature is the record', 'Signed notes release billing automatically'] }
];

const SPECIALTIES = [
  ['🫀', 'Cardiology', 'ECG findings, cardiac history, drug interactions — structured for cardiologists.'],
  ['🧠', 'Neurology', 'Neuro exam templates, stroke scoring, seizure history and CNS medication management.'],
  ['🩺', 'Nephrology', 'Dialysis schedules, creatinine tracking, renal drug dosing.'],
  ['🔬', 'Endocrinology', 'HbA1c trends, thyroid panels, diabetes management plans.'],
  ['👶', 'Paediatrics', 'Age & weight-based dosing, vaccine schedules, growth charts.'],
  ['🦷', 'Dental', 'Tooth chart, procedure tracking, dental Rx templates.'],
  ['🤰', 'Gynaecology & Obs', 'ANC tracking, LMP calculator, trimester-wise templates.'],
  ['👁️', 'Ophthalmology', 'Visual acuity charts, IOP readings, refraction Rx.']
];

const AI_CARDS = [
  ['01', '📋', 'Chart Summary', 'Instantly summarizes patient history and past visits, so you walk into every consultation prepared.', 'Roadmap'],
  ['02', '💬', 'Chart Chat', "Ask questions in plain language and get instant answers from your patient's record.", 'Roadmap'],
  ['03', '℞', 'Simplified Digital Prescriptions', 'AI-assisted prescription writing with ICD-10 coding built in.', 'Live'],
  ['04', '✎', 'AI Scribe', 'Turns your consultation into a structured clinical note — human sign-off always required.', 'Live']
];

export default function Landing() {
  const [active, setActive] = useState(1);
  const mod = MODULES.find(m => m.n === active);

  return (
    <div className="landing">
      <div className="land-strip">🏥 All-in-One Clinic Management Software · HIPAA-grade security · Built for US practices</div>

      <header className="land-nav">
        <div className="land-logo">＋ ClinicOS</div>
        <nav>
          <a href="#features">Practice Tool</a>
          <a href="#specialties">Specialties</a>
          <a href="#ai">Gen AI</a>
          <Link to="/portal">Patient Portal</Link>
        </nav>
        <Link to="/login" className="muted" style={{ textDecoration: 'none', fontWeight: 600 }}>Sign in</Link>
        <Link to="/signup"><button className="primary">Start free trial</button></Link>
      </header>

      <section className="land-hero">
        <span className="chip">• CLINIC MANAGEMENT SOFTWARE FOR THE USA</span>
        <h1>The Smart Clinic Management Software <span>for Modern Doctors</span></h1>
        <p>Manage appointments, EMR, billing, prescriptions, claims and patient communication — all from
          one AI-powered platform that helps you save time, improve patient care, and grow your practice.</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link to="/signup"><button className="primary big">Start your 14-day free trial</button></Link>
          <Link to="/login"><button className="big">Sign in to your clinic</button></Link>
          <Link to="/portal"><button className="big">I'm a patient</button></Link>
        </div>
        <div className="land-stats">
          <span><b>Full</b> revenue-cycle automation</span>
          <span><b>AI</b> clinical documentation</span>
          <span><b>HIPAA</b> compliant by design</span>
        </div>
      </section>

      <section id="features" className="land-section">
        <span className="chip">• CLINIC OS</span>
        <h2>360° Practice Management Tool</h2>
        <p className="land-sub">One clinic management software for digital prescriptions, doctor appointment booking, patient CRM, and analytics.</p>
        <div className="carousel">
          <div className="carousel-list">
            {MODULES.map(m => (
              <button key={m.n} className={`carousel-item ${active === m.n ? 'active' : ''}`} onClick={() => setActive(m.n)}>
                <span className="feature-num">{m.n}</span>
                <span>
                  <b>{m.title}</b>
                  {active === m.n && <small>{m.sub}</small>}
                </span>
              </button>
            ))}
          </div>
          <div className="carousel-detail card">
            <h3>{mod.heading}</h3>
            <ul>
              {mod.points.map((p, i) => <li key={i}>✓ {p}</li>)}
            </ul>
            <Link to="/login"><button className="primary">Try Now</button></Link>
          </div>
        </div>
      </section>

      <section id="specialties" className="land-section">
        <h2>Purpose-built prescription pads for every speciality in your clinic.</h2>
        <p className="land-sub">Not a generic EMR padded out for every department — each specialty gets a prescription pad and workflow designed around how that doctor actually works.</p>
        <div className="spec-grid">
          {SPECIALTIES.map(([icon, name, desc]) => (
            <div className="spec-card card" key={name}>
              <div className="spec-icon">{icon}</div>
              <b>{name}</b>
              <p className="muted">{desc}</p>
              <span className="chip small">Customised Pad</span>
            </div>
          ))}
        </div>
      </section>

      <section id="ai" className="land-section">
        <span className="chip">• GEN AI</span>
        <h2>Generative AI built into the clinical workflow</h2>
        <p className="land-sub">Improving patient care, diagnostics, and operational efficiency — with a clinician signature on every record.</p>
        <div className="ai-grid">
          {AI_CARDS.map(([num, icon, title, desc, state]) => (
            <div className="card ai-card" key={num}>
              <span className="ai-num">{num}</span>
              <span className="ai-icon">{icon}</span>
              <span className={`chip small ${state === 'Live' ? 'chip-live' : ''}`}>
                {state === 'Live' ? '● Live' : 'Roadmap'}
              </span>
              <b>{title}</b>
              <p className="muted">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="land-section">
        <span className="chip">• WHY SWITCH</span>
        <h2>Ditch the Paper Chart. Keep the Relationship.</h2>
        <div className="compare">
          <div className="card compare-bad">
            <h3>Paper Charts & Loose Files</h3>
            <ul>
              <li>✗ Records lost, misfiled, or damaged over time</li>
              <li>✗ No way to search patient history instantly</li>
              <li>✗ Prescriptions handwritten, hard to read or share</li>
              <li>✗ No backup if a file goes missing</li>
            </ul>
          </div>
          <div className="card compare-good">
            <h3>ClinicOS Electronic Health Records</h3>
            <ul>
              <li>✓ Every patient record digitized, encrypted & backed up</li>
              <li>✓ Full medical history searchable in one tap</li>
              <li>✓ Digital prescription pad, ICD-10 coded</li>
              <li>✓ Claims tracked from submission to payout</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="land-section land-cta">
        <span className="chip">• MULTI-DOCTOR CLINICS</span>
        <h2>Managing Multiple Doctors? We've Got You Covered</h2>
        <p className="land-sub">Dedicated front-desk queue, per-doctor calendars, and role-based staff access — built into the same clinic management software.</p>
        <Link to="/login"><button className="primary big">Sign in to your clinic</button></Link>
      </section>

      <footer className="land-foot">
        <b>＋ ClinicOS</b> · Clinic management software for modern practices · HIPAA compliant · © 2026
      </footer>
    </div>
  );
}
