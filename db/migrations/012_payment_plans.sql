-- Payment plans (installments) + card-on-file scaffold

CREATE TABLE payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  processor TEXT NOT NULL DEFAULT 'stripe',
  processor_ref TEXT,                    -- payment method id at the processor (never raw PAN)
  brand TEXT, last4 TEXT, exp_month INT, exp_year INT,
  is_default BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES invoices(id),
  total_amount NUMERIC(10,2) NOT NULL,
  installments INT NOT NULL,
  cadence TEXT NOT NULL DEFAULT 'monthly',   -- weekly | biweekly | monthly
  status TEXT NOT NULL DEFAULT 'active',     -- active | completed | cancelled
  auto_charge BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payment_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  plan_id UUID NOT NULL REFERENCES payment_plans(id) ON DELETE CASCADE,
  seq INT NOT NULL,
  due_date DATE NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  paid_at TIMESTAMPTZ,
  payment_id UUID REFERENCES payments(id),
  status TEXT NOT NULL DEFAULT 'scheduled'   -- scheduled | paid | failed | skipped
);
CREATE INDEX idx_ppi_due ON payment_plan_items (due_date) WHERE paid_at IS NULL;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['payment_methods','payment_plans','payment_plan_items'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_tenant()) WITH CHECK (tenant_id = current_tenant())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_user', t);
  END LOOP;
END $$;

CREATE POLICY portal_pm ON payment_methods AS RESTRICTIVE
  USING (NOT is_client() OR client_id = current_client());
CREATE POLICY portal_pp ON payment_plans AS RESTRICTIVE
  USING (NOT is_client() OR client_id = current_client());
CREATE POLICY portal_ppi ON payment_plan_items AS RESTRICTIVE
  USING (NOT is_client() OR EXISTS (
    SELECT 1 FROM payment_plans pp WHERE pp.id = payment_plan_items.plan_id AND pp.client_id = current_client()));
