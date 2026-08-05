# Deploying the demo

**Recommended: Render** — genuinely free, no credit card, and 1 GB Postgres that
never expires. Fly.io now requires payment; its config is kept below as an option.

---

# Option A — Render (free, no card)

Publishes a public demo with seeded fake data at `https://clinicos-demo.onrender.com`.

> **No real patient data.** No BAA, no encryption at rest. A demo tenant holding
> real records without a BAA is already a HIPAA violation. See `PRODUCTION_READINESS.md`.

## Deploy

1. Push this repo to GitHub (already done).
2. Go to **https://dashboard.render.com/blueprints** → **New Blueprint Instance**.
3. Connect your GitHub account and pick `clinical-practice-management`.
4. Render reads `render.yaml`, shows the web service + Postgres, and asks you to
   confirm. Click **Apply**.

That's it — no CLI, no card. First build takes 3–5 minutes. Render generates
`JWT_SECRET` automatically and wires `DATABASE_URL` from the database.

## If the build fails on `CREATE ROLE app_user`

Render's database user may lack `CREATEROLE`. The migration will say so explicitly.
Open the database in Render → **Connect** → **PSQL Command**, run it, then paste:

```
CREATE ROLE app_user LOGIN PASSWORD 'pick-a-strong-password';
```

Then hit **Manual Deploy** on the web service. (Migration 016 FORCEs row-level
security, so isolation holds whichever role the app ends up connecting as.)

## Free-tier behaviour

The service sleeps after ~15 minutes idle and cold-starts in 30–60 seconds — the
first request after a quiet period is slow, then it's normal. 750 hours/month
covers one always-available service.

---

# Option B — Fly.io (now requires payment)

Publishes a **public demo with seeded fake data** at `https://clinicos-demo.fly.dev`.
Landing page, staff app, patient portal and platform console all served from one
app — the React build is baked into the API image, so there is no CORS to configure.

> **No real patient data on this deployment.** No BAA, no encryption at rest.
> A demo tenant holding real records without a BAA is already a HIPAA violation.
> See `PRODUCTION_READINESS.md` before anything resembling production.

---

## One-time setup

**1. Install the CLI and sign in**

```
brew install flyctl
```
```
fly auth signup
```

**2. Create the app** (run from the repo root — do NOT let it deploy yet)

```
fly launch --no-deploy --copy-config --name clinicos-demo --region sjc
```

If `clinicos-demo` is taken, pick another name and update `app =` in `fly.toml`.

**3. Create Postgres and attach it**

```
fly postgres create --name clinicos-db --region sjc --initial-cluster-size 1 --vm-size shared-cpu-1x --volume-size 1
```
```
fly postgres attach clinicos-db --app clinicos-demo
```

Attaching sets `DATABASE_URL` automatically. The app talks to Postgres over Fly's
private WireGuard network, which is why `DATABASE_SSL="false"` is defensible here
and nowhere public.

**4. Set secrets**

```
fly secrets set JWT_SECRET="$(openssl rand -base64 48)" --app clinicos-demo
```
```
fly secrets set MIGRATE_DATABASE_URL="$(fly ssh console --app clinicos-demo -C 'printenv DATABASE_URL' 2>/dev/null | tr -d '\r')" --app clinicos-demo
```

If that second command returns nothing, read `DATABASE_URL` from the output of
`fly postgres attach` and set it manually:

```
fly secrets set MIGRATE_DATABASE_URL="postgres://..." --app clinicos-demo
```

Migrations need the owner role; the app itself runs as `app_user` under RLS.

---

## Deploy

```
fly deploy
```

The release command runs `npm run migrate && npm run seed` **before** new machines
take traffic — that's why concurrent replicas never race on the same migration.

```
fly open
```

---

## Demo logins

| Surface | URL | Credentials |
|---|---|---|
| Landing | `/` | — |
| Staff app | `/login` | `owner@demo.practice` / `Demo1234!` |
| Clinician | `/login` | `clinician@demo.practice` / `Demo1234!` |
| Biller | `/login` | `biller@demo.practice` / `Demo1234!` |
| Patient portal | `/portal` | `jamie@example.com` / DOB `1990-04-12` |
| Platform console | `/platform` | `admin@clinicos.app` / `Demo1234!` |

**Change these before sharing the link publicly** — they're in the repo, so anyone
reading the source can sign in. For a shared demo, either rotate the seed passwords
or put the app behind Fly's basic auth.

---

## Best demo path (about 4 minutes)

1. **Landing page** — scroll through the animated revenue-cycle pipeline
2. **Owner login** → Dashboard, then Calendar (month view)
3. **Patients** → open Jamie Rivera → *Verify eligibility* (Pverify mock returns copay/deductible)
4. **Clinician login** → Notes → *Generate AI draft* → edit → *Sign & lock*
5. **Biller login** → Claim Tracker → *Submit (837P)* → wait ~20 s for the mock payer
6. **Remittances** → *Fetch & auto-post ERAs* → claim flips to **Funded**, patient balance invoiced
7. **Patient portal** → that balance is now visible under Bills

The isolation proof is worth showing too: sign in as `clinician@` and note that
Morgan Lee is invisible — enforced by PostgreSQL row-level security, not the UI.

---

## Operating it

```
fly logs --app clinicos-demo
```
```
fly status --app clinicos-demo
```
```
fly ssh console --app clinicos-demo
```

Reset the demo data:

```
fly ssh console --app clinicos-demo -C "npm run seed"
```

**Cost.** `auto_stop_machines = "suspend"` and `min_machines_running = 0` mean the app
sleeps when idle and wakes on request (a few seconds of cold start). One shared-cpu-1x
machine plus a 1 GB Postgres volume sits within Fly's low-cost tier.

To take the demo down entirely:

```
fly apps destroy clinicos-demo
```
```
fly apps destroy clinicos-db
```
