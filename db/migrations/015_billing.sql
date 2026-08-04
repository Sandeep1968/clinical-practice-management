-- Billing completeness: fee schedules & sliding scale, superbills, statements,
-- CMS-1500 data, and Good Faith Estimates (No Surprises Act).

-- ---------- service/fee catalogue (CPT codes are NOT hardcoded: they change annually) ----------
CREATE TABLE service_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  cpt TEXT NOT NULL,
  description TEXT NOT NULL,
  default_rate NUMERIC(10,2) NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 50,
  active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (tenant_id, cpt)
);

-- sliding scale: per-client rate override or discount, common in therapy
CREATE TABLE client_fee_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  pay_type TEXT NOT NULL DEFAULT 'insurance',   -- insurance | self_pay | sliding_scale
  sliding_rate NUMERIC(10,2),                   -- flat agreed session rate
  discount_pct NUMERIC(5,2),                    -- or a % off the standard rate
  effective_from DATE NOT NULL DEFAULT current_date,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fee_client ON client_fee_agreements (client_id, effective_from DESC);

-- ---------- Good Faith Estimate (No Surprises Act — required for self-pay/uninsured) ----------
CREATE TABLE good_faith_estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  clinician_id UUID REFERENCES clinicians(id),
  diagnosis_codes JSONB NOT NULL DEFAULT '[]',
  service_cpt TEXT,
  service_description TEXT,
  rate_per_session NUMERIC(10,2) NOT NULL,
  expected_sessions INT NOT NULL DEFAULT 12,
  total_estimate NUMERIC(10,2) NOT NULL,
  period_months INT NOT NULL DEFAULT 12,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  client_ack_at TIMESTAMPTZ,
  notes TEXT
);
CREATE INDEX idx_gfe_client ON good_faith_estimates (client_id, issued_at DESC);

-- ---------- statements (periodic account summary sent to the client) ----------
CREATE TABLE statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  charges NUMERIC(10,2) NOT NULL DEFAULT 0,
  payments NUMERIC(10,2) NOT NULL DEFAULT 0,
  balance NUMERIC(10,2) NOT NULL DEFAULT 0,
  lines JSONB NOT NULL DEFAULT '[]',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

-- ---------- superbill (itemized receipt the client submits for out-of-network reimbursement) ----------
CREATE TABLE superbills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  clinician_id UUID REFERENCES clinicians(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  lines JSONB NOT NULL DEFAULT '[]',    -- [{dos, cpt, description, units, rate, amount, icd[]}]
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- practice identifiers needed on CMS-1500 / superbills
ALTER TABLE branding ADD COLUMN IF NOT EXISTS tax_id TEXT;
ALTER TABLE branding ADD COLUMN IF NOT EXISTS group_npi TEXT;
ALTER TABLE branding ADD COLUMN IF NOT EXISTS place_of_service TEXT DEFAULT '11';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS address JSONB;

-- ---------- RLS ----------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['service_codes','client_fee_agreements','good_faith_estimates',
                           'statements','superbills'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_tenant()) WITH CHECK (tenant_id = current_tenant())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_user', t);
  END LOOP;
END $$;

-- patients see their own financial documents in the portal
CREATE POLICY portal_gfe ON good_faith_estimates AS RESTRICTIVE
  USING (NOT is_client() OR client_id = current_client());
CREATE POLICY portal_stmt ON statements AS RESTRICTIVE
  USING (NOT is_client() OR client_id = current_client());
CREATE POLICY portal_super ON superbills AS RESTRICTIVE
  USING (NOT is_client() OR client_id = current_client());
CREATE POLICY portal_fee ON client_fee_agreements AS RESTRICTIVE
  USING (NOT is_client() OR client_id = current_client());

-- ---------- seed common behavioral-health CPT codes for the demo practice ----------
INSERT INTO service_codes (tenant_id, cpt, description, default_rate, duration_minutes) VALUES
  ('11111111-1111-1111-1111-111111111111', '90791', 'Psychiatric diagnostic evaluation', 200.00, 60),
  ('11111111-1111-1111-1111-111111111111', '90832', 'Psychotherapy, 30 minutes', 90.00, 30),
  ('11111111-1111-1111-1111-111111111111', '90834', 'Psychotherapy, 45 minutes', 130.00, 45),
  ('11111111-1111-1111-1111-111111111111', '90837', 'Psychotherapy, 60 minutes', 150.00, 60),
  ('11111111-1111-1111-1111-111111111111', '90846', 'Family psychotherapy without patient', 140.00, 50),
  ('11111111-1111-1111-1111-111111111111', '90847', 'Family psychotherapy with patient', 150.00, 50),
  ('11111111-1111-1111-1111-111111111111', '90853', 'Group psychotherapy', 60.00, 60);
