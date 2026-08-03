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
- [ ] Client portal

## Demo: full revenue cycle in the UI

1. Owner login → Clients → **Verify eligibility** (Pverify mock returns copay/deductible).
2. Owner → Schedule → move the seeded appointment to **completed** (creates an encounter).
3. Clinician login (`clinician@demo.practice`) → **Notes** → open the encounter → **Generate AI draft** → edit → **Sign & lock** (creates a draft claim).
4. Biller login (`biller@demo.practice`) → **Claim Tracker** → **Submit (837P)** — claim number assigned; mock payer adjudicates ~20 seconds later and the status moves on its own.
