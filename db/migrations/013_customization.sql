-- Practice customization: branding + note/plan template library

CREATE TABLE branding (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  display_name TEXT,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#2563EB',
  rx_header TEXT,                 -- clinic address / phone printed on the Rx
  rx_footer TEXT,                 -- disclaimers, license text
  portal_welcome TEXT,
  timezone TEXT DEFAULT 'America/Los_Angeles',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- reusable clinical templates (progress notes, treatment plan skeletons)
CREATE TABLE clinical_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  scope TEXT NOT NULL DEFAULT 'note',     -- note | plan
  name TEXT NOT NULL,
  specialty TEXT,
  body JSONB NOT NULL DEFAULT '{}',       -- note: {sections:[...]}, plan: {goals:[...]}
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['branding','clinical_templates'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_tenant()) WITH CHECK (tenant_id = current_tenant())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_user', t);
  END LOOP;
END $$;

-- branding is readable by the patient portal too (logo/colors/welcome)
CREATE POLICY portal_branding ON branding AS RESTRICTIVE USING (true);

INSERT INTO branding (tenant_id, display_name, rx_header, portal_welcome)
VALUES ('11111111-1111-1111-1111-111111111111', 'Demo Practice',
        '123 Main Street, Riverside, CA 92501 · (951) 555-0142',
        'Welcome to your patient portal. Here you can view visits, prescriptions, your treatment plan, and pay bills.');

INSERT INTO clinical_templates (tenant_id, scope, name, specialty, body) VALUES
  ('11111111-1111-1111-1111-111111111111', 'note', 'SOAP — Behavioral Health', 'Behavioral Health',
   '{"sections":["Subjective","Objective","Assessment","Plan"]}'),
  ('11111111-1111-1111-1111-111111111111', 'note', 'DAP — Counseling', 'Behavioral Health',
   '{"sections":["Data","Assessment","Plan"]}'),
  ('11111111-1111-1111-1111-111111111111', 'note', 'BIRP — Case Management', 'Behavioral Health',
   '{"sections":["Behavior","Intervention","Response","Plan"]}'),
  ('11111111-1111-1111-1111-111111111111', 'plan', 'Anxiety / CBT starter', 'Behavioral Health',
   '{"goals":[{"goal":"Reduce anxiety symptoms to a manageable level","objectives":[{"text":"Reduce GAD-7 score below 10","measure":"GAD-7 monthly"}],"interventions":"Cognitive restructuring; relaxation training"}]}'),
  ('11111111-1111-1111-1111-111111111111', 'plan', 'Depression / behavioral activation', 'Behavioral Health',
   '{"goals":[{"goal":"Improve mood and daily functioning","objectives":[{"text":"Reduce PHQ-9 score below 10","measure":"PHQ-9 monthly"},{"text":"Complete 3 pleasant activities weekly","measure":"Activity log"}],"interventions":"Behavioral activation; sleep hygiene"}]}');
