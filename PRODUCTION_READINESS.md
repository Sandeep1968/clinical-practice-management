# Production readiness assessment

**Honest verdict: this is a strong, feature-complete pilot build. It is NOT yet
ready to hold real patient data.** The remaining work is mostly organisational and
infrastructural rather than code — but it is not optional, and some of it has long
lead times. Plan 6–10 weeks before first PHI.

---

## Fixed in this pass

| Issue | Severity | Resolution |
|---|---|---|
| `JWT_SECRET` defaulted to `'dev-secret'` — a signed token could be forged | **Critical** | `config.js` refuses to boot in production without a strong secret |
| CORS reflected any origin (`cors()` with no options) | **High** | Strict allowlist from `CORS_ORIGINS`; no wildcard |
| No rate limiting — login open to brute force | **High** | 10 attempts / 15 min on all credential endpoints, keyed on IP + identity |
| bcrypt cost 10 for password storage | Medium | scrypt (memory-hard, built-in); legacy bcrypt verified and auto-upgraded on login |
| Errors logged with full request context | **High** (PHI leak) | Structured logging of method/path/message only — never bodies |
| No security headers | Medium | nosniff, DENY framing, no-referrer, HSTS, `Cache-Control: no-store` for PHI |
| Unbounded request bodies | Medium | 1 MB limit |
| Container ran as root | Medium | Non-root `app` user |
| No graceful shutdown — in-flight transactions killed | Medium | SIGTERM drain with 15 s timeout |
| No TLS to the database | **High** | `DATABASE_SSL` enforced in production |
| No liveness/readiness split | Low | `/health` and `/ready` (checks DB) |
| **No isolation tests** | **Critical** | 12 tests asserting cross-tenant, cross-clinician and portal isolation fail *at the database* |
| No CI | High | GitHub Actions: migrate → unit → **isolation gate** → audit → secret scan |

Isolation test coverage now proves: an unfiltered `SELECT` returns only the current
tenant; cross-tenant read/update/insert all fail; a clinician cannot see unassigned
clients; a portal session sees only itself and cannot see unsigned treatment plans;
`audit_log` cannot be deleted by the application role.

---

## Blockers before real PHI

### Legal / organisational — start now, these have lead times
- [ ] **Healthcare attorney review** of the BAA template and all marketing claims
- [ ] **Signed BAAs** with every subcontractor: cloud host, managed Postgres, object
      storage, Twilio, email provider, payment processor, clearinghouse, Pverify,
      and any AI/transcription vendor
- [ ] **Documented HIPAA risk analysis** (§164.308(a)(1)) — required, and the first
      thing OCR asks for
- [ ] Workforce security policies, training records, sanction policy
- [ ] Incident response and breach notification runbook (60-day clock; set a shorter
      internal window in your BAAs)
- [ ] Cyber liability insurance

### Infrastructure
- [ ] **Encryption at rest** (AES-256) on database, backups and object storage.
      Breached *encrypted* data may qualify for safe-harbour from notification entirely —
      this single control is the highest-leverage item on this list.
- [ ] Secrets in a managed store (AWS Secrets Manager / GCP Secret Manager), not env files
- [ ] Object storage for document binaries — currently metadata only, files aren't stored
- [ ] Migrations as a separate job/init-container (concurrent replicas would race today)
- [ ] Backups with tested point-in-time restore; document RPO/RTO
- [ ] Centralised logging with PHI scrubbing before egress; log retention ≥ 6 years
- [ ] Redis-backed rate limiting (current limiter is per-pod, so N pods = N× the limit)
- [ ] WAF / DDoS protection at the edge

### Engineering
- [ ] Penetration test by a third party
- [ ] Load test — the reminder worker runs `setInterval` in-process; move to a queue
      with a dedicated worker before multi-pod deployment or reminders will double-send
- [ ] Refresh-token rotation with reuse detection and server-side revocation
- [ ] Portal login is email + DOB — **replace with OTP before launch** (DOB is a weak
      second factor and is often discoverable)
- [ ] Input validation schema layer (zod/joi) on every route body
- [ ] Note amendments: signed notes lock correctly, but there's no addendum flow —
      legally you append to a signed note rather than editing it
- [ ] Supervision workflow (supervisor co-signature) — needed for group practices with
      pre-licensed associates, and it intersects the isolation model
- [ ] Data migration importer (SimplePractice / TherapyNotes) — this is your stated
      differentiator and is currently a promise, not code

---

## Known scope gaps (deliberate)

- AI notes and all vendor integrations run in **mock mode**. They are wired end-to-end
  but no real vendor call is made until credentials are supplied — and none should be
  until BAAs exist.
- CMS-1500 produces a **field map**, not a rendered PDF on the official form.
- E-prescribing exists from an earlier direction but is out of scope for behavioural
  health — don't market it.
- Telehealth video is not built (V2 in your roadmap).

---

## Suggested sequence

1. **Week 1–2:** encryption at rest, secrets manager, object storage, migration job split
2. **Week 2–4:** portal OTP, refresh rotation, validation layer, queue-backed worker
3. **Parallel from day 1:** attorney review, BAAs, risk analysis, insurance
4. **Week 5–6:** penetration test, load test, restore drill
5. **Then:** pilot with one friendly practice under a signed BAA, real data, close monitoring

Do not skip step 3 to reach a pilot faster — a BAA must be signed *before* the first
real record is entered, and the risk analysis is what OCR asks for first.
