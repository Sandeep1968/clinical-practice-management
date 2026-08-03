-- Documents, intake forms and e-signatures
DROP TABLE IF EXISTS documents CASCADE;

CREATE TYPE doc_kind AS ENUM ('intake','consent','insurance_card','lab','referral','upload','other');
CREATE TYPE doc_status AS ENUM ('pending_signature','signed','received','archived');

CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES users(id),
  kind doc_kind NOT NULL DEFAULT 'upload',
  title TEXT NOT NULL,
  description TEXT,
  storage_uri TEXT,                 -- object storage pointer (encrypted bucket in prod)
  mime_type TEXT,
  size_bytes BIGINT,
  body TEXT,                        -- for generated/intake forms rendered as text
  status doc_status NOT NULL DEFAULT 'received',
  requires_signature BOOLEAN NOT NULL DEFAULT false,
  signed_by_client_at TIMESTAMPTZ,
  signed_by_client_name TEXT,
  signed_by_staff UUID REFERENCES users(id),
  signed_by_staff_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_docs_client ON documents (tenant_id, client_id, created_at DESC);

-- reusable intake/consent form templates
CREATE TABLE form_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  kind doc_kind NOT NULL DEFAULT 'intake',
  body TEXT NOT NULL,
  requires_signature BOOLEAN NOT NULL DEFAULT true,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['documents','form_templates'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_tenant()) WITH CHECK (tenant_id = current_tenant())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_user', t);
  END LOOP;
END $$;

-- clinicians see documents for their own caseload; patients see their own
CREATE POLICY clinician_scope_docs ON documents AS RESTRICTIVE
  USING (NOT is_clinician() OR client_id IS NULL OR EXISTS (
    SELECT 1 FROM client_assignments ca
     WHERE ca.client_id = documents.client_id AND ca.clinician_id = current_clinician() AND ca.ended_at IS NULL));
CREATE POLICY portal_docs ON documents AS RESTRICTIVE
  USING (NOT is_client() OR client_id = current_client());

-- demo templates + a pending consent for the demo patient
INSERT INTO form_templates (tenant_id, name, kind, body) VALUES
  ('11111111-1111-1111-1111-111111111111', 'New Patient Intake', 'intake',
   E'Please review and confirm the following:\n\n1. Contact and emergency contact details are current.\n2. Current medications and allergies have been disclosed.\n3. Relevant medical and behavioral health history has been provided.\n\nBy signing you confirm the information provided is accurate to the best of your knowledge.'),
  ('11111111-1111-1111-1111-111111111111', 'HIPAA Notice of Privacy Practices', 'consent',
   E'This notice describes how medical information about you may be used and disclosed and how you can get access to this information.\n\nWe are required by law to maintain the privacy of your protected health information, provide you with this notice of our legal duties and privacy practices, and notify you following a breach of unsecured protected health information.\n\nBy signing you acknowledge receipt of this notice.'),
  ('11111111-1111-1111-1111-111111111111', 'Telehealth Consent', 'consent',
   E'I consent to receive services via telehealth. I understand the benefits and limitations of telehealth, including the possibility of technical failure, and that I may withdraw consent at any time.');

INSERT INTO documents (tenant_id, client_id, kind, title, body, status, requires_signature)
SELECT '11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444441',
       'consent', ft.name, ft.body, 'pending_signature', true
FROM form_templates ft
WHERE ft.tenant_id = '11111111-1111-1111-1111-111111111111'
  AND ft.name = 'HIPAA Notice of Privacy Practices';
