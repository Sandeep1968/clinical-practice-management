-- Clinical Practice Management — core schema
-- Multi-tenant with Row-Level Security (tenant layer + clinician-isolation layer)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- application role (API connects as this; RLS applies) ----------
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD 'app_pass';
  END IF;
END $$;

-- ---------- enums ----------
CREATE TYPE user_role AS ENUM ('owner','admin','clinician','biller','front_desk');
CREATE TYPE appt_status AS ENUM ('booked','confirmed','arrived','completed','no_show','cancelled');
CREATE TYPE encounter_status AS ENUM ('open','note_pending','signed','billed');
CREATE TYPE claim_status AS ENUM ('draft','submitted','in_revision','pending_patient_liability','funded','denied');

-- ---------- tenants & identity ----------
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subdomain TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL DEFAULT 'trial',
  settings JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,          -- bcrypt in dev; Argon2id in prod
  mfa_secret TEXT,                      -- encrypted TOTP secret (null = MFA not enrolled)
  full_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

CREATE TABLE user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role user_role NOT NULL,
  PRIMARY KEY (user_id, role)
);

CREATE TABLE clinicians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id),
  npi TEXT,
  license_no TEXT,
  taxonomy TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- clients & assignments (drives clinician isolation) ----------
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  dob DATE,
  email TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_clients_tenant_name ON clients (tenant_id, last_name, first_name);

CREATE TABLE client_assignments (
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  clinician_id UUID NOT NULL REFERENCES clinicians(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  PRIMARY KEY (client_id, clinician_id)
);
CREATE INDEX idx_assignments_clinician ON client_assignments (clinician_id) WHERE ended_at IS NULL;

-- ---------- insurance ----------
CREATE TABLE insurance_payers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  payer_id TEXT,
  clearinghouse_code TEXT
);

CREATE TABLE client_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  payer_id UUID NOT NULL REFERENCES insurance_payers(id),
  member_id TEXT NOT NULL,
  group_no TEXT,
  rank SMALLINT NOT NULL DEFAULT 1,      -- 1=primary 2=secondary
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE eligibility_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  policy_id UUID NOT NULL REFERENCES client_policies(id),
  appointment_id UUID,
  pverify_ref TEXT,
  result JSONB,
  copay NUMERIC(10,2),
  deductible_remaining NUMERIC(10,2),
  status TEXT NOT NULL DEFAULT 'pending',  -- pending|verified|failed
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- scheduling ----------
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  clinician_id UUID NOT NULL REFERENCES clinicians(id),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  appt_type TEXT NOT NULL DEFAULT 'session',
  location TEXT NOT NULL DEFAULT 'office',   -- office|telehealth
  telehealth_url TEXT,
  status appt_status NOT NULL DEFAULT 'booked',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_appts_clinician_time ON appointments (tenant_id, clinician_id, starts_at);
CREATE INDEX idx_appts_client ON appointments (tenant_id, client_id, starts_at);

-- ---------- clinical ----------
CREATE TABLE encounters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  appointment_id UUID UNIQUE REFERENCES appointments(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  clinician_id UUID NOT NULL REFERENCES clinicians(id),
  dos DATE NOT NULL,
  cpt_codes TEXT[] NOT NULL DEFAULT '{}',
  icd_codes TEXT[] NOT NULL DEFAULT '{}',
  rate NUMERIC(10,2),
  status encounter_status NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_encounters_status ON encounters (tenant_id, status);

CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  encounter_id UUID NOT NULL UNIQUE REFERENCES encounters(id),
  template_type TEXT NOT NULL DEFAULT 'SOAP',  -- SOAP|DAP|BIRP
  ai_draft JSONB,
  final_text TEXT,
  signed_by UUID REFERENCES users(id),
  signed_at TIMESTAMPTZ,
  locked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- billing & claims ----------
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  encounter_id UUID REFERENCES encounters(id),
  amount NUMERIC(10,2) NOT NULL,
  balance NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',   -- open|paid|partial|void
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  encounter_id UUID NOT NULL REFERENCES encounters(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  provider_id UUID NOT NULL REFERENCES clinicians(id),
  payer_id UUID REFERENCES insurance_payers(id),
  claim_number TEXT UNIQUE,
  dos DATE NOT NULL,
  rate NUMERIC(10,2) NOT NULL,
  status claim_status NOT NULL DEFAULT 'draft',
  expected_payout_date DATE,
  funded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_claims_tracker ON claims (tenant_id, status, dos);

CREATE TABLE claim_status_history (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  from_status claim_status,
  to_status claim_status NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',  -- manual|clearinghouse|era
  payload JSONB,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  client_id UUID REFERENCES clients(id),
  invoice_id UUID REFERENCES invoices(id),
  claim_id UUID REFERENCES claims(id),
  method TEXT NOT NULL,                   -- card|ach|era|cash
  amount NUMERIC(10,2) NOT NULL,
  processor_ref TEXT,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- audit (append-only) ----------
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  user_id UUID,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  ip TEXT,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE UPDATE, DELETE ON audit_log FROM PUBLIC;

-- =====================================================================
-- ROW-LEVEL SECURITY
-- Session context set by the API per-request:
--   app.tenant_id  — from the JWT
--   app.user_id    — from the JWT
--   app.user_role  — highest role for this request
--   app.clinician_id — set when role = clinician
-- =====================================================================

CREATE OR REPLACE FUNCTION current_tenant() RETURNS UUID
  LANGUAGE sql STABLE AS $$ SELECT current_setting('app.tenant_id', true)::uuid $$;

CREATE OR REPLACE FUNCTION is_clinician() RETURNS BOOLEAN
  LANGUAGE sql STABLE AS $$ SELECT current_setting('app.user_role', true) = 'clinician' $$;

CREATE OR REPLACE FUNCTION current_clinician() RETURNS UUID
  LANGUAGE sql STABLE AS $$ SELECT current_setting('app.clinician_id', true)::uuid $$;

-- tenant-layer RLS on every tenant-scoped table
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','clinicians','clients','client_policies','eligibility_checks',
    'appointments','encounters','notes','invoices','claims',
    'claim_status_history','payments','audit_log'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_tenant()) WITH CHECK (tenant_id = current_tenant())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_user', t);
  END LOOP;
END $$;

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_self ON tenants USING (id = current_tenant());
GRANT SELECT, UPDATE ON tenants TO app_user;
GRANT SELECT, INSERT ON insurance_payers TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON client_assignments TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- clinician-isolation layer: clinicians see only assigned clients
-- (RESTRICTIVE = ANDed with the tenant policy above)
CREATE POLICY clinician_scope ON clients AS RESTRICTIVE
  USING (
    NOT is_clinician()
    OR EXISTS (
      SELECT 1 FROM client_assignments ca
      WHERE ca.client_id = clients.id
        AND ca.clinician_id = current_clinician()
        AND ca.ended_at IS NULL
    )
  );

CREATE POLICY clinician_scope_appts ON appointments AS RESTRICTIVE
  USING (NOT is_clinician() OR clinician_id = current_clinician());

CREATE POLICY clinician_scope_encounters ON encounters AS RESTRICTIVE
  USING (NOT is_clinician() OR clinician_id = current_clinician());

CREATE POLICY clinician_scope_notes ON notes AS RESTRICTIVE
  USING (
    NOT is_clinician()
    OR EXISTS (SELECT 1 FROM encounters e
               WHERE e.id = notes.encounter_id AND e.clinician_id = current_clinician())
  );

-- notes content: only the treating clinician reads note bodies (minimum necessary).
-- Owners/admins/billers work from encounter metadata, not note text — enforced app-side
-- via column selection; break-glass reads must call the audited RPC below.
-- Login lookup: runs before any tenant context exists, so it must bypass RLS.
-- SECURITY DEFINER (owner = migration superuser) and read-only by design.
CREATE OR REPLACE FUNCTION auth_login_lookup(p_subdomain TEXT, p_email TEXT)
RETURNS TABLE (id UUID, tenant_id UUID, email TEXT, password_hash TEXT,
               full_name TEXT, role user_role, clinician_id UUID)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT u.id, u.tenant_id, u.email, u.password_hash, u.full_name,
         (SELECT ur.role FROM user_roles ur WHERE ur.user_id = u.id
          ORDER BY CASE ur.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1
                   WHEN 'biller' THEN 2 WHEN 'clinician' THEN 3 ELSE 4 END
          LIMIT 1),
         c.id
  FROM users u
  JOIN tenants t ON t.id = u.tenant_id
  LEFT JOIN clinicians c ON c.user_id = u.id
  WHERE t.subdomain = p_subdomain AND lower(u.email) = lower(p_email)
    AND u.status = 'active' AND t.status = 'active'
$$;
GRANT EXECUTE ON FUNCTION auth_login_lookup(TEXT, TEXT) TO app_user;

CREATE OR REPLACE FUNCTION break_glass_read_note(p_note UUID, p_reason TEXT)
RETURNS TABLE (final_text TEXT) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO audit_log (tenant_id, user_id, action, entity, entity_id)
  VALUES (current_tenant(), current_setting('app.user_id', true)::uuid,
          'BREAK_GLASS_NOTE_READ: ' || p_reason, 'notes', p_note::text);
  RETURN QUERY SELECT n.final_text FROM notes n WHERE n.id = p_note;
END $$;
