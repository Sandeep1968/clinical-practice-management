-- Digital prescriptions (eka-style Rx pad)
CREATE TABLE prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  clinician_id UUID NOT NULL REFERENCES clinicians(id),
  encounter_id UUID REFERENCES encounters(id),
  diagnoses JSONB NOT NULL DEFAULT '[]',    -- [{code: 'F41.1', label: 'Generalized anxiety disorder'}]
  medications JSONB NOT NULL DEFAULT '[]',  -- [{name, strength, frequency, duration, instructions}]
  advice TEXT,
  follow_up_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rx_client ON prescriptions (tenant_id, client_id, created_at DESC);

ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON prescriptions
  USING (tenant_id = current_tenant()) WITH CHECK (tenant_id = current_tenant());
CREATE POLICY clinician_scope_rx ON prescriptions AS RESTRICTIVE
  USING (NOT is_clinician() OR clinician_id = current_clinician());
GRANT SELECT, INSERT ON prescriptions TO app_user;
