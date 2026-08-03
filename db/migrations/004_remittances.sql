-- ERA (835) remittances: payer payment advice, auto-posted to claims
CREATE TABLE remittances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  payer_id UUID REFERENCES insurance_payers(id),
  era_ref TEXT NOT NULL,                 -- 835 trace number (TRN02)
  total NUMERIC(12,2) NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  posted_at TIMESTAMPTZ,
  raw JSONB
);

CREATE TABLE remittance_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  remittance_id UUID NOT NULL REFERENCES remittances(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES claims(id),
  billed NUMERIC(10,2) NOT NULL,
  paid NUMERIC(10,2) NOT NULL,
  patient_responsibility NUMERIC(10,2) NOT NULL DEFAULT 0,
  adjustment_codes TEXT[],               -- CARC codes (e.g. CO-45 contractual)
  status TEXT NOT NULL DEFAULT 'posted'  -- posted|exception
);
CREATE INDEX idx_remit_lines_claim ON remittance_lines (claim_id);

-- RLS (same tenant-isolation pattern as the rest of the schema)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['remittances','remittance_lines'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_tenant()) WITH CHECK (tenant_id = current_tenant())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO app_user', t);
  END LOOP;
END $$;
