-- FORCE row-level security.
--
-- WHY THIS MATTERS: in PostgreSQL, a table's OWNER bypasses RLS by default.
-- Locally the app connects as app_user (not the owner) so policies apply. But on
-- managed hosts (Render, Neon, Supabase, RDS) you are usually given a single role
-- that owns everything — and connecting as that role would silently disable every
-- tenant, clinician and portal isolation policy in this schema.
--
-- FORCE makes the policies apply to the owner too, so isolation holds regardless
-- of which role the app connects as. Defence in depth against a deployment mistake
-- that would otherwise be invisible until it leaked data.

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','clinicians','clients','client_policies','eligibility_checks',
    'appointments','encounters','notes','invoices','claims',
    'claim_status_history','payments','audit_log','tenants',
    'remittances','remittance_lines','prescriptions','reminders',
    'treatment_plans','treatment_goals','documents','form_templates',
    'message_threads','messages','broadcasts','notifications',
    'payment_methods','payment_plans','payment_plan_items',
    'branding','clinical_templates','availability_rules','availability_blocks',
    'appointment_series','appointment_participants','waitlist_entries',
    'service_codes','client_fee_agreements','good_faith_estimates',
    'statements','superbills'
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

-- Managed hosts: grant the connecting role what it needs, whoever it is.
-- (No-op locally, where app_user already holds these grants.)
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO CURRENT_USER', t);
  END LOOP;
END $$;
