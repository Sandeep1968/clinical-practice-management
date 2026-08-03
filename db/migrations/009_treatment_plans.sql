-- Treatment plans: versioned, goal/objective structured, e-signed by clinician
-- (and optionally acknowledged by the patient in the portal).
-- Note: 001 created a placeholder treatment_plans table; replace it with the real model.
DROP TABLE IF EXISTS treatment_plans CASCADE;

CREATE TYPE plan_status AS ENUM ('draft','active','completed','discontinued');
CREATE TYPE goal_status AS ENUM ('not_started','in_progress','met','partially_met','discontinued');

CREATE TABLE treatment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  clinician_id UUID NOT NULL REFERENCES clinicians(id),
  version INT NOT NULL DEFAULT 1,
  supersedes_id UUID REFERENCES treatment_plans(id),
  title TEXT NOT NULL DEFAULT 'Treatment Plan',
  presenting_problem TEXT,
  diagnoses JSONB NOT NULL DEFAULT '[]',      -- [{code:'F41.1', label:'GAD'}]
  frequency TEXT,                              -- e.g. 'Weekly, 50-minute sessions'
  modality TEXT,                               -- e.g. 'CBT'
  status plan_status NOT NULL DEFAULT 'draft',
  start_date DATE NOT NULL DEFAULT current_date,
  review_date DATE,
  -- e-signatures
  signed_by UUID REFERENCES users(id),
  signed_at TIMESTAMPTZ,
  locked BOOLEAN NOT NULL DEFAULT false,
  client_ack_at TIMESTAMPTZ,                   -- patient acknowledgement from portal
  client_ack_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tp_client ON treatment_plans (tenant_id, client_id, created_at DESC);

CREATE TABLE treatment_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  plan_id UUID NOT NULL REFERENCES treatment_plans(id) ON DELETE CASCADE,
  seq INT NOT NULL DEFAULT 1,
  goal TEXT NOT NULL,                          -- long-term goal
  objectives JSONB NOT NULL DEFAULT '[]',      -- [{text, measure, target_date}]
  interventions TEXT,
  target_date DATE,
  status goal_status NOT NULL DEFAULT 'not_started',
  progress_pct INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tg_plan ON treatment_goals (plan_id, seq);

-- progress notes can reference the plan goal they address
ALTER TABLE notes ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES treatment_plans(id);

-- ---------- RLS: tenant + clinician + patient-portal layers ----------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['treatment_plans','treatment_goals'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_tenant()) WITH CHECK (tenant_id = current_tenant())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_user', t);
  END LOOP;
END $$;

CREATE POLICY clinician_scope_tp ON treatment_plans AS RESTRICTIVE
  USING (NOT is_clinician() OR clinician_id = current_clinician());
CREATE POLICY clinician_scope_tg ON treatment_goals AS RESTRICTIVE
  USING (NOT is_clinician() OR EXISTS (
    SELECT 1 FROM treatment_plans tp
     WHERE tp.id = treatment_goals.plan_id AND tp.clinician_id = current_clinician()));

-- patients see their own signed plans in the portal
CREATE POLICY portal_tp ON treatment_plans AS RESTRICTIVE
  USING (NOT is_client() OR (client_id = current_client() AND signed_at IS NOT NULL));
CREATE POLICY portal_tg ON treatment_goals AS RESTRICTIVE
  USING (NOT is_client() OR EXISTS (
    SELECT 1 FROM treatment_plans tp
     WHERE tp.id = treatment_goals.plan_id
       AND tp.client_id = current_client() AND tp.signed_at IS NOT NULL));

-- ---------- demo data ----------
INSERT INTO treatment_plans
  (id, tenant_id, client_id, clinician_id, title, presenting_problem, diagnoses,
   frequency, modality, status, review_date, signed_by, signed_at, locked)
VALUES
  ('aaaaaaaa-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111',
   '44444444-4444-4444-4444-444444444441', '33333333-3333-3333-3333-333333333331',
   'Anxiety Management Plan',
   'Client reports persistent worry, sleep disruption, and avoidance of work presentations over the past 6 months.',
   '[{"code":"F41.1","label":"Generalized anxiety disorder"}]',
   'Weekly, 50-minute sessions', 'Cognitive Behavioral Therapy (CBT)',
   'active', current_date + 90, '22222222-2222-2222-2222-222222222222', now() - interval '7 days', true);

INSERT INTO treatment_goals (tenant_id, plan_id, seq, goal, objectives, interventions, target_date, status, progress_pct) VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-00000000000a', 1,
   'Reduce generalized anxiety symptoms to a manageable level',
   '[{"text":"Reduce GAD-7 score from 16 to below 10","measure":"GAD-7 administered monthly","target_date":null},
     {"text":"Practice diaphragmatic breathing 5x weekly","measure":"Self-report log reviewed each session","target_date":null}]',
   'Psychoeducation on anxiety cycle; cognitive restructuring; relaxation training.',
   current_date + 90, 'in_progress', 40),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-00000000000a', 2,
   'Increase engagement in avoided work situations',
   '[{"text":"Deliver one team presentation without cancellation","measure":"Client report + subjective units of distress","target_date":null}]',
   'Graded exposure hierarchy; behavioral experiments; assertiveness skills.',
   current_date + 120, 'not_started', 0);
