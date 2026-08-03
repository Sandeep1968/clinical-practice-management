# Clinical Practice Management Platform

Multi-tenant, HIPAA-oriented SaaS for US clinical practices. Built from the
[Workflow & Architecture Document](docs/Clinical_Practice_Management_Workflow.docx).

**Revenue-cycle spine:** Client → Appointment → Insurance Verification → Session →
AI Clinical Notes → Billing → Claim → Claim Tracking → Payment → Reporting

## Monorepo Layout

```
db/migrations/   PostgreSQL schema — multi-tenant with Row-Level Security (RLS)
api/             Node.js (Express) REST API — stateless, horizontally scalable
web/             React (Vite) frontend — staff portal
docker-compose.yml
```

## Architecture Decisions

| Concern | Decision |
|---|---|
| Multi-tenancy | Shared-schema Postgres; every row carries `tenant_id`; **RLS enforced in the DB**, not just app code |
| Clinician isolation | Second RLS layer via `client_assignments` — clinicians can only read their own caseload (core product requirement) |
| Auth | JWT access (15 min) + refresh rotation; RBAC roles: owner, admin, clinician, biller, front_desk. MFA/TOTP hook included (stub) |
| Scalability | Stateless API (scale pods behind LB), pg connection pooling, keyset pagination, indexes on all FK/lookup paths, async-job seams for eligibility/claims/AI notes |
| Claims | Status machine: draft → submitted → in_revision / pending_patient_liability → funded (denied → in_revision), full `claim_status_history` audit trail |

## Seeing stale UI?

Source is bind-mounted into the containers, so code changes apply on restart.
If a page still looks old:

```bash
./dev.sh          # down → rebuild --no-cache → up (prints URLs)
```

then open a **private/incognito window** (rules out browser cache), or in DevTools →
Network → tick **Disable cache** and refresh.

Fastest UI loop (no Docker rebuilds at all):

```bash
docker compose up -d db api    # backend in Docker
cd web && npm install && npm run dev   # Vite on the host, instant hot reload
```

## Quick Start

```bash
docker compose up -d db          # Postgres 16 on :5432
cd api && npm i && npm run migrate && npm run seed && npm run dev   # API on :4000
cd web && npm i && npm run dev   # Frontend on :5173
```

Demo login (seeded): `owner@demo.practice` / `Demo1234!`

## Security Notes (production checklist)

- Swap bcrypt → **Argon2id**; enable the TOTP MFA stub; put TLS everywhere.
- Run API DB access as the non-superuser `app_user` role (migrations create it) so RLS applies.
- Encrypt Postgres at rest; move recordings/docs to encrypted object storage.
- Append-only `audit_log` is wired into middleware — ship it to immutable storage.
- BAAs required: cloud, Pverify, clearinghouse, payment processor, AI vendor.

## Module Roadmap (matches doc §6.3)

- [x] Auth / RBAC / RLS, tenants, clients, assignments
- [x] Scheduling (appointments CRUD + status flow)
- [x] Encounters + notes (sign-to-lock, releases billing)
- [x] Claims + claim tracker with status history
- [x] Pverify eligibility adapter (`api/src/adapters/pverify.js` — mock mode; set `PVERIFY_CLIENT_ID`/`PVERIFY_CLIENT_SECRET` for real)
- [x] Clearinghouse 837P submission adapter (`api/src/adapters/clearinghouse.js` — mock adjudication ~20s; set `CLEARINGHOUSE_API_KEY` for real)
- [x] AI note drafting (`api/src/adapters/ai_notes.js` — template mock; set `ANTHROPIC_API_KEY` for real, requires vendor BAA)
- [x] ERA 835 auto-posting (`api/src/adapters/era.js` — mock generates payer payments at 80% with CO-45/PR-2 adjustments; claims auto-move to Funded, patient balances auto-invoiced)
- [x] Digital prescriptions (eka-style Rx pad: ICD-10 diagnoses, structured meds, printable branded Rx)
- [x] Patient queue (front-desk day view: waiting / upcoming / seen, check-in flow)
- [x] Practice analytics (revenue by month, claims funnel, no-show rate)
- [x] MFA (TOTP, RFC 6238 — enroll in Settings; two-step login once enabled)
- [x] SMS appointment reminders (24h before; TCPA consent-gated; mock mode logs, set `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_FROM` for real)
- [x] Documents & e-signatures — form/consent template library, send-to-portal for signature, patient e-sign, uploads register, staff countersign, chart Documents tab
- [x] Communication — secure two-way messaging (staff inbox ↔ patient portal) and patient broadcasts (SMS consent-gated, or portal message) with audience targeting
- [x] Notifications — in-app bell with unread badge, role-scoped feed, mark-read, deep links
- [x] Payment plans — installment schedules (weekly/biweekly/monthly) against invoices, per-installment charging, auto-charge flag, patient view in portal; card-on-file table ready for Stripe
- [x] Customization — practice branding (name, logo, color, Rx header/footer, portal welcome) and clinical template library (note & treatment-plan templates)
- [x] Treatment plans — versioned goals/objectives with measurable targets, interventions, progress tracking, clinician e-signature (sign-to-lock), revision creating a new version, and patient acknowledgement in the portal
- [x] Patient portal (`/portal` — email + DOB login, visits, prescriptions, bills, self-booking; DB-level RLS scoping to own records. Demo: jamie@example.com / 1990-04-12)
- [x] eka-style interface (topbar with global patient search, avatars, tabbed patient chart at /patients/:id, gradient stat chips)
- [x] Public landing page at `/` (hero, interactive 360° module carousel, specialty pads, Gen AI cards, comparison)
- [x] SaaS administration — practice self-signup with 14-day trial (`/signup`), plans & subscriptions, forgot/reset password, and a super-admin platform console (`/platform`: practices, plan changes, suspend/reactivate, MRR & platform analytics). Demo admin: `admin@clinicos.app` / `Demo1234!`

## Application surfaces

| URL | Who | What |
|---|---|---|
| `/` | Public | Marketing landing page |
| `/signup` | New practices | Self-serve tenant creation + trial |
| `/login` | Clinic staff | Staff app (MFA-aware) |
| `/portal` | Patients | Visits, prescriptions, bills, self-booking |
| `/platform` | Super-admin | Cross-tenant SaaS console |

## Demo: full revenue cycle in the UI

1. Owner login → Clients → **Verify eligibility** (Pverify mock returns copay/deductible).
2. Owner → Schedule → move the seeded appointment to **completed** (creates an encounter).
3. Clinician login (`clinician@demo.practice`) → **Notes** → open the encounter → **Generate AI draft** → edit → **Sign & lock** (creates a draft claim).
4. Biller login (`biller@demo.practice`) → **Claim Tracker** → **Submit (837P)** — claim number assigned; mock payer adjudicates ~20 seconds later and the status moves on its own.
