import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

/* ---------------- data ---------------- */

const PIPELINE = [
  { k: 'intake',    label: 'Intake',        icon: '👤', detail: 'Forms e-signed in the portal' },
  { k: 'schedule',  label: 'Scheduled',     icon: '📅', detail: 'Slot booked · reminders queued' },
  { k: 'eligible',  label: 'Verified',      icon: '🛡', detail: 'Copay $25 · deductible $340 left' },
  { k: 'session',   label: 'Session',       icon: '🗣', detail: '50-min · CPT 90837' },
  { k: 'note',      label: 'AI Note',       icon: '✨', detail: 'SOAP drafted · awaiting signature' },
  { k: 'signed',    label: 'Signed',        icon: '✍️', detail: 'Locked · billing released' },
  { k: 'claim',     label: 'Claim 837P',    icon: '📤', detail: 'CLM-2026-4471 submitted' },
  { k: 'adjudicated', label: 'Adjudicated', icon: '⏳', detail: 'Payer response received' },
  { k: 'era',       label: 'ERA Posted',    icon: '💵', detail: '$120 paid · CO-45 adjustment' },
  { k: 'funded',    label: 'Funded',        icon: '✅', detail: '$30 patient balance invoiced' }
];

const MODULES = [
  { icon: '📅', title: 'Scheduling that fills itself', body: 'Calendar, availability rules, recurring weekly slots, waitlist matching on cancellations, SMS + email reminders.', span: 2, tone: 'blue' },
  { icon: '✨', title: 'AI Scribe', body: 'Session → structured SOAP / DAP / BIRP draft. Clinician edits and signs — the signature is the legal record.', span: 1, tone: 'violet' },
  { icon: '⛨', title: 'Claims that chase themselves', body: '837P submission, live claim tracker, denial handling, ERA auto-posting to Funded.', span: 1, tone: 'green' },
  { icon: '◎', title: 'Treatment plans', body: 'Versioned goals with measurable objectives, progress tracking, e-signature, patient acknowledgement.', span: 1, tone: 'amber' },
  { icon: '🔒', title: 'Real clinician isolation', body: 'Clinicians see only their own caseload — enforced by database row-level security, not UI filtering. Proven by tests in CI.', span: 1, tone: 'slate' }
];

const STATS = [
  { to: 10, suffix: '', label: 'revenue-cycle stages automated' },
  { to: 90, suffix: '%', label: 'of the claim lifecycle hands-free' },
  { to: 24, suffix: 'h', label: 'reminder lead time, SMS + email' },
  { to: 3, suffix: '', label: 'isolation layers in the database' }
];

const SECURITY = [
  ['🔐', 'Row-level security', 'Tenant and clinician isolation enforced by PostgreSQL. A missing filter fails closed, not open.'],
  ['📋', 'Append-only audit log', 'Every PHI read and write logged with user, time and action. Deletion revoked at the database.'],
  ['🔑', 'MFA + break-glass', 'TOTP two-factor for staff. Emergency access requires a documented reason and self-audits.'],
  ['📜', 'No Surprises Act', 'Good Faith Estimates for self-pay clients, with a queue flagging anyone missing one.'],
  ['📵', 'TCPA-safe messaging', 'SMS only to patients who consented. Non-consenting patients are recorded as skipped, never messaged.'],
  ['🗺', 'Telehealth licensure', 'Booking blocked when the clinician is not licensed in the client’s state.']
];

const FAQ = [
  ['Is ClinicOS HIPAA compliant?', 'No software is — compliance is a property of your organisation, not a product, and OCR has never certified any platform. What we provide are the safeguards that support your compliance program: database-enforced isolation, append-only audit logging, MFA, break-glass with documented reason, and a signed BAA. We publish the full list, including the gaps.'],
  ['How is this different from SimplePractice?', 'Three things. Clinician data isolation is enforced in the database rather than the interface — a known pain point for group practices. The revenue cycle runs further on its own, through ERA posting to Funded. And AI documentation is native, not an add-on.'],
  ['What happens to my data if we leave?', 'You export it. Records are structured and exportable by design — no lock-in, and the data is yours.'],
  ['Do you handle group and family sessions?', 'Yes. CPT 90847 and 90853 are supported with multiple participants on one session, billing the primary client.'],
  ['How long does onboarding take?', 'A solo practice can be running the same day. Group practices typically take one to two weeks including data migration and staff training.']
];

/* ---------------- hooks ---------------- */

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('[data-reveal]');
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);
}

function Counter({ to, suffix = '', dur = 1400 }) {
  const [n, setN] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (t) => {
        const p = Math.min((t - t0) / dur, 1);
        setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [to, dur]);
  return <span ref={ref}>{n}{suffix}</span>;
}

/* ---------------- page ---------------- */

export default function Landing() {
  useReveal();
  const [stage, setStage] = useState(0);
  const [openFaq, setOpenFaq] = useState(0);
  const [sent, setSent] = useState(false);

  // auto-advance the revenue-cycle pipeline
  useEffect(() => {
    const t = setInterval(() => setStage(s => (s + 1) % PIPELINE.length), 1900);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="lp">
      {/* ---------- announcement ---------- */}
      <div className="lp-strip">
        <span className="lp-dot" /> Built for US behavioural health · HIPAA-ready safeguards · Signed BAA
      </div>

      {/* ---------- nav ---------- */}
      <header className="lp-nav">
        <Link to="/" className="lp-logo"><span className="lp-mark">✚</span> ClinicOS</Link>
        <nav>
          <a href="#pipeline">How it works</a>
          <a href="#modules">Platform</a>
          <a href="#security">Security</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="lp-nav-cta">
          <Link to="/portal" className="lp-ghost">Patient portal</Link>
          <Link to="/login" className="lp-ghost">Sign in</Link>
          <Link to="/signup"><button className="lp-btn">Start free trial</button></Link>
        </div>
      </header>

      {/* ---------- hero ---------- */}
      <section className="lp-hero">
        <div className="lp-mesh" aria-hidden="true">
          <span className="blob b1" /><span className="blob b2" /><span className="blob b3" />
          <span className="grid-fade" />
        </div>

        <div className="lp-hero-inner">
          <div className="lp-hero-copy">
            <span className="lp-pill">◆ Practice management for therapy &amp; behavioural health</span>
            <h1>
              The practice management system<br />
              that <span className="grad">gets you paid</span>
            </h1>
            <p className="lp-lede">
              One platform for scheduling, AI clinical notes, treatment plans, insurance and claims —
              where a signed note becomes a submitted claim becomes a posted payment, without anyone
              re-typing a thing.
            </p>
            <ul className="lp-checks">
              <li>Claim submitted, tracked and auto-posted to Funded — hands-free</li>
              <li>AI-drafted SOAP notes, signed by the clinician who owns them</li>
              <li>Clinicians see only their own caseload — enforced in the database</li>
            </ul>
            <div className="lp-hero-btns">
              <Link to="/signup"><button className="lp-btn lg">Start 14-day free trial →</button></Link>
              <Link to="/login"><button className="lp-btn ghost lg">Sign in to your practice</button></Link>
            </div>
            <div className="lp-microtrust">
              <span><b>No card</b> required</span><span className="sep" />
              <span><b>Migration</b> included</span><span className="sep" />
              <span><b>Cancel</b> anytime</span>
            </div>
          </div>

          {/* live dashboard mockup */}
          <div className="lp-hero-app" data-reveal>
            <div className="app-chrome">
              <span className="tl r" /><span className="tl y" /><span className="tl g" />
              <span className="app-url">app.clinicos.health</span>
              <span className="live"><span className="lp-dot" /> Live</span>
            </div>
            <div className="app-body">
              <div className="app-kpis">
                <div className="kpi k-blue"><span className="kpi-n">$<Counter to={18420} /></span><span className="kpi-l">Collected this month ▲ 12%</span></div>
                <div className="kpi k-amber"><span className="kpi-n"><Counter to={3} /></span><span className="kpi-l">Notes awaiting signature</span></div>
                <div className="kpi k-green"><span className="kpi-n"><Counter to={11} /></span><span className="kpi-l">Claims funded this week</span></div>
              </div>

              <div className="app-panel">
                <div className="app-panel-head">
                  <b>Today · Dr. Reyes</b>
                  <span className="badge-live">4 sessions</span>
                </div>
                {[
                  ['JR', 'Jamie Rivera', '9:00 AM · Individual · 90837', 'ok', 'Verified'],
                  ['ML', 'Morgan Lee', '10:00 AM · Intake · 90791', 'warn', 'Forms pending'],
                  ['AK', 'Avery Kim', '11:00 AM · Telehealth · 90834', 'ok', 'Verified'],
                  ['TS', 'Taylor Singh', '1:00 PM · Family · 90847', 'ok', 'Verified']
                ].map(([ini, name, meta, tone, tag]) => (
                  <div className="app-row" key={name}>
                    <span className={`av a-${ini[0].toLowerCase()}`}>{ini}</span>
                    <span className="app-row-main"><b>{name}</b><small>{meta}</small></span>
                    <span className={`chip ${tone}`}>{tag}</span>
                  </div>
                ))}
              </div>

              <div className="app-panel tight">
                <div className="app-panel-head"><b>Claim tracker</b><span className="muted-s">live</span></div>
                <div className="track">
                  {['Submitted', 'Adjudicated', 'Funded'].map((s, i) => (
                    <div className={`track-step ${i <= 2 ? 'done' : ''}`} key={s}>
                      <span className="tick">✓</span>{s}
                    </div>
                  ))}
                </div>
                <div className="track-amt">CLM-2026-4471 · $150 billed · <b>$120 paid</b> · $30 to patient</div>
              </div>
            </div>
          </div>
        </div>

        <div className="lp-badges" data-reveal>
          {['HIPAA-ready safeguards', 'Signed BAA', 'X12 837P / 835', 'ICD-10 · CPT', 'No Surprises Act', 'TCPA-safe'].map(b => (
            <span key={b}>{b}</span>
          ))}
        </div>
      </section>

      {/* ---------- animated pipeline ---------- */}
      <section id="pipeline" className="lp-sec dark">
        <div className="lp-sec-head" data-reveal>
          <span className="lp-eyebrow">The revenue cycle, automated</span>
          <h2>Watch a session become money in the bank</h2>
          <p>Every stage below is a working module. Data flows forward automatically — a signed note
             releases billing, a submitted claim tracks itself, a posted ERA closes the loop.</p>
        </div>

        <div className="pipe" data-reveal>
          <div className="pipe-rail">
            <div className="pipe-fill" style={{ width: `${(stage / (PIPELINE.length - 1)) * 100}%` }} />
            {PIPELINE.map((p, i) => (
              <button
                key={p.k}
                className={`pipe-node ${i === stage ? 'active' : ''} ${i < stage ? 'past' : ''}`}
                onClick={() => setStage(i)}
                style={{ left: `${(i / (PIPELINE.length - 1)) * 100}%` }}
                aria-label={p.label}
              >
                <span className="pipe-ico">{p.icon}</span>
                <span className="pipe-lbl">{p.label}</span>
              </button>
            ))}
          </div>

          <div className="pipe-card" key={stage}>
            <span className="pipe-step">Step {stage + 1} of {PIPELINE.length}</span>
            <h3>{PIPELINE[stage].icon} {PIPELINE[stage].label}</h3>
            <p>{PIPELINE[stage].detail}</p>
            <div className="pipe-bar"><span /></div>
          </div>
        </div>

        <div className="lp-stats" data-reveal>
          {STATS.map(s => (
            <div className="lp-stat" key={s.label}>
              <b><Counter to={s.to} suffix={s.suffix} /></b>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- bento modules ---------- */}
      <section id="modules" className="lp-sec">
        <div className="lp-sec-head" data-reveal>
          <span className="lp-eyebrow">One platform, every workflow</span>
          <h2>Everything a behavioural health practice actually runs on</h2>
          <p>Not a general EHR bent into shape. Built for therapy: 90791, 90834, 90837, 90847, 90853 —
             sliding scale, superbills, group sessions and all.</p>
        </div>

        <div className="bento">
          {MODULES.map(m => (
            <article className={`bento-card span-${m.span} t-${m.tone}`} key={m.title} data-reveal>
              <span className="bento-ico">{m.icon}</span>
              <h3>{m.title}</h3>
              <p>{m.body}</p>
              <span className="bento-glow" />
            </article>
          ))}
          <article className="bento-card span-2 cta-card" data-reveal>
            <h3>Plus the unglamorous things that decide renewals</h3>
            <div className="mini-grid">
              {['Patient portal', 'Documents & e-sign', 'Secure messaging', 'Payment plans',
                'Superbills & statements', 'Good Faith Estimates', 'Waitlist matching', 'Practice analytics'].map(x => (
                <span key={x}>✓ {x}</span>
              ))}
            </div>
          </article>
        </div>
      </section>

      {/* ---------- marquee ---------- */}
      <section className="lp-marquee-wrap" data-reveal>
        <div className="lp-marquee">
          <div className="lp-track">
            {[...Array(2)].map((_, dup) => (
              <span className="lp-track-inner" key={dup}>
                {['Solo therapists', 'Group practices', 'Counselling centres', 'Psychology clinics',
                  'Marriage & family therapy', 'Substance use programs', 'Telehealth-first practices',
                  'Psychiatric NPs', 'Community mental health'].map(t => (
                  <em key={t}>{t}<i>◆</i></em>
                ))}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- security ---------- */}
      <section id="security" className="lp-sec tinted">
        <div className="lp-sec-head" data-reveal>
          <span className="lp-eyebrow">Security &amp; compliance</span>
          <h2>Isolation you can actually verify</h2>
          <p>
            Most platforms filter data in the interface. We enforce it in PostgreSQL — and ship the
            tests that try to break it. If a cross-tenant read ever succeeds, our build fails.
          </p>
        </div>
        <div className="sec-grid">
          {SECURITY.map(([ico, t, b]) => (
            <div className="sec-card" key={t} data-reveal>
              <span className="sec-ico">{ico}</span>
              <b>{t}</b><p>{b}</p>
            </div>
          ))}
        </div>
        <p className="lp-honest" data-reveal>
          <b>Straight answer:</b> no software is “HIPAA compliant” — compliance belongs to your
          organisation, and OCR certifies no products. We give you the safeguards, a signed BAA, and
          an honest list of what’s still on us to finish.
        </p>
      </section>

      {/* ---------- FAQ ---------- */}
      <section id="faq" className="lp-sec">
        <div className="lp-sec-head" data-reveal>
          <span className="lp-eyebrow">Questions people actually ask</span>
          <h2>Before you switch</h2>
        </div>
        <div className="faq" data-reveal>
          {FAQ.map(([q, a], i) => (
            <div className={`faq-item ${openFaq === i ? 'open' : ''}`} key={q}>
              <button onClick={() => setOpenFaq(openFaq === i ? -1 : i)}>
                <span>{q}</span><i>{openFaq === i ? '−' : '+'}</i>
              </button>
              <div className="faq-a"><p>{a}</p></div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- CTA + form ---------- */}
      <section className="lp-cta">
        <div className="lp-mesh cta-mesh" aria-hidden="true">
          <span className="blob b1" /><span className="blob b2" />
        </div>
        <div className="lp-cta-inner">
          <div data-reveal>
            <h2>See it on your own caseload</h2>
            <p>A 30-minute walkthrough on your workflows — intake, notes, claims and the portal —
               so you can judge it on your daily reality, not slides.</p>
            <ul className="lp-checks light">
              <li>Free migration from SimplePractice or TherapyNotes</li>
              <li>Onboarding and staff training included</li>
              <li>Talk to an engineer, not a script</li>
            </ul>
          </div>

          <form className="lp-form" data-reveal onSubmit={(e) => { e.preventDefault(); setSent(true); }}>
            {sent ? (
              <div className="lp-sent">
                <span className="lp-sent-ico">✓</span>
                <h3>Request received</h3>
                <p>We’ll be in touch within one business day. Want to look around first?</p>
                <Link to="/signup"><button className="lp-btn" type="button">Start the free trial now</button></Link>
              </div>
            ) : (
              <>
                <h3>Book a demo</h3>
                <p className="lp-form-sub">No spam — your details are used only to arrange the demo.</p>
                <label>Full name<input required placeholder="Dr. Jane Smith" /></label>
                <label>Work email<input type="email" required placeholder="jane@practice.com" /></label>
                <label>Phone<input type="tel" placeholder="(555) 019-2847" /></label>
                <div className="lp-form-row">
                  <label>Practice type
                    <select defaultValue="">
                      <option value="" disabled>Select…</option>
                      <option>Solo therapist</option>
                      <option>Group practice (2–10)</option>
                      <option>Group practice (10+)</option>
                      <option>Counselling centre</option>
                      <option>Psychiatric practice</option>
                    </select>
                  </label>
                  <label>Clinicians
                    <select defaultValue="">
                      <option value="" disabled>Select…</option>
                      <option>Just me</option><option>2–5</option><option>6–15</option><option>16+</option>
                    </select>
                  </label>
                </div>
                <button className="lp-btn lg full">Request my demo →</button>
                <small className="lp-form-fine">
                  By submitting you agree to be contacted about ClinicOS. No PHI in this form.
                </small>
              </>
            )}
          </form>
        </div>
      </section>

      {/* ---------- footer ---------- */}
      <footer className="lp-foot">
        <div className="lp-foot-inner">
          <div className="lp-foot-brand">
            <span className="lp-logo"><span className="lp-mark">✚</span> ClinicOS</span>
            <p>Practice management for US behavioural health. Scheduling, AI documentation,
               treatment plans, claims and payments — on one record.</p>
          </div>
          <div>
            <b>Platform</b>
            <a href="#pipeline">Revenue cycle</a><a href="#modules">Modules</a>
            <a href="#security">Security</a><Link to="/portal">Patient portal</Link>
          </div>
          <div>
            <b>Get started</b>
            <Link to="/signup">Free trial</Link><Link to="/login">Sign in</Link>
            <a href="#faq">FAQ</a>
          </div>
          <div>
            <b>Compliance</b>
            <span>HIPAA-ready safeguards</span><span>Signed BAA</span>
            <span>X12 837P / 835</span><span>No Surprises Act</span>
          </div>
        </div>
        <div className="lp-foot-bar">
          © 2026 ClinicOS · Not medical or legal advice · No software is HIPAA compliant on its own
        </div>
      </footer>
    </div>
  );
}
