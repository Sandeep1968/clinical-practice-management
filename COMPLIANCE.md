# Compliance posture — read before selling or demoing

**This is engineering documentation, not legal advice. Have a healthcare attorney
review your BAA template and all marketing claims before selling into US healthcare.**

## Language rules (important)

**No software is HIPAA compliant.** Compliance is a property of an *organization* —
its policies, training, risk analysis, contracts and controls. Software provides
safeguards that *support* a customer's compliance program. OCR has never certified
any product, and there is no such thing as HIPAA certification.

Never write, in product copy, sales decks or contracts:

- ❌ "HIPAA compliant software"
- ❌ "HIPAA certified"
- ❌ "Fully compliant out of the box"

Use instead:

- ✅ "HIPAA-ready" / "built to support HIPAA compliance"
- ✅ Better — enumerate the actual safeguards (specific claims are more credible
  *and* commit you only to what you built)

## We are a Business Associate

Handling PHI on behalf of a covered entity makes this platform a Business Associate.
Since HITECH, BAs are **directly liable to OCR**, not merely contractually liable
to the customer.

- **A signed BAA is required before any PHI enters the system — including demos.**
  A demo tenant containing real patient records without a BAA is already a violation.
  Use the seeded fake data for demos.
- **Every subcontractor touching PHI needs a BAA:** cloud host, managed Postgres,
  object storage, email (SES/Postmark), SMS (Twilio), payment processor,
  clearinghouse, Pverify, and any LLM/transcription API.
- **Most commonly missed:** error tracking and log aggregation. Stack traces and
  request payloads routinely carry PHI. Scrub before anything leaves the boundary.
- Breach notice to the covered entity is due without unreasonable delay and no later
  than 60 days from discovery — set a **shorter internal window** in the BAA, because
  the covered entity's own clock is what matters.

## Safeguards implemented in this codebase

| Safeguard | Implementation |
|---|---|
| Tenant isolation | Postgres RLS on every tenant-scoped table — a missing app filter fails **closed** |
| Clinician isolation | Restrictive RLS policies via `client_assignments`; not UI filtering |
| Patient portal isolation | Restrictive RLS on `client_id` from the session, never a request parameter |
| Unique user identification | Per-user accounts; no shared logins (a shared front-desk login destroys audit value) |
| Authentication | Password + TOTP MFA (RFC 6238) |
| Audit controls | Append-only `audit_log`; UPDATE/DELETE revoked; **read access logged, not just writes** |
| Emergency access | `break_glass_read_note()` requires a documented reason and self-audits |
| Minimum necessary | Role-scoped routes; note bodies restricted to the treating clinician |
| Automatic logoff | 15-minute access tokens |
| Transmission security | TLS required in deployment |
| Session context | Tenant/role/clinician derived server-side from the JWT, never client-supplied |

## Gaps to close before production PHI

- [ ] **Encryption at rest** (AES-256) on database and object storage. Encryption is
      currently "addressable" not "required" — but breached *encrypted* data may qualify
      for **safe harbor from notification entirely**. Treat as required.
- [ ] Argon2id password hashing (bcrypt is in place for development)
- [ ] KMS envelope encryption for MFA secrets
- [ ] Signed BAAs with every subcontractor listed above
- [ ] PHI scrubbing in error tracking / logs
- [ ] Automated cross-tenant read tests asserting failure **at the database**
- [ ] Documented risk analysis, workforce training, incident response plan
- [ ] Object storage for document binaries (currently metadata only)

## On the proposed Security Rule overhaul

HHS published an NPRM on 6 January 2025 (90 FR 800) proposing mandatory encryption,
MFA, asset inventory, network segmentation, scheduled penetration testing and annual
BA verification.

**As of mid-2026 this is NOT law.** The comment period closed March 2025; OCR is still
processing comments; the anticipated 2026 finalization did not occur and the Unified
Agenda now targets **July 2027**. Hospital and provider associations have asked HHS to
withdraw it.

Do not describe these as current requirements — many vendor blogs do, and repeating it
misleads customers about their obligations. **Build toward them anyway**: encryption,
MFA and asset inventory are defensible practices regardless, sophisticated buyers ask
for them contractually, and retrofitting encryption onto a populated database is far
worse than starting with it.

## Coding standards

- **Do not hardcode code sets.** ICD-10-CM updates every October; CPT annually.
  Service codes live in the `service_codes` table for exactly this reason.
- CPT is AMA-licensed — there are commercial implications to redistributing the code set.
- NPI is 10 digits (Type 1 individual / Type 2 organization). DEA numbers are for
  controlled substances only — do not require universally.
- CMS-1500 for professional claims (837P electronic equivalent).

## Other US obligations built in

- **No Surprises Act** — Good Faith Estimates for self-pay/uninsured clients, with a
  work queue flagging clients who lack a current one.
- **TCPA** — SMS only to patients with explicit consent and a number on file; non-consenting
  patients are recorded as skipped, never messaged.
- **Telehealth licensure** — booking is blocked when the clinician isn't licensed in the
  client's state.
