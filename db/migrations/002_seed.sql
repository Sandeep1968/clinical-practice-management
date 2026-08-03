-- Demo seed: one tenant, owner + clinician + biller, two clients, sample pipeline
-- Password for all demo users: Demo1234!  (bcrypt, cost 10)

INSERT INTO tenants (id, name, subdomain) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Demo Practice', 'demo');

INSERT INTO users (id, tenant_id, email, password_hash, full_name) VALUES
  ('22222222-2222-2222-2222-222222222221', '11111111-1111-1111-1111-111111111111',
   'owner@demo.practice', '$2a$10$/eVpdNUdxA0dJSjB8smtJOCj/WZY0kwEUW4Uzi5ppXm56PCIdKTUu', 'Dana Owner'),
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
   'clinician@demo.practice', '$2a$10$/eVpdNUdxA0dJSjB8smtJOCj/WZY0kwEUW4Uzi5ppXm56PCIdKTUu', 'Casey Clinician'),
  ('22222222-2222-2222-2222-222222222223', '11111111-1111-1111-1111-111111111111',
   'biller@demo.practice', '$2a$10$/eVpdNUdxA0dJSjB8smtJOCj/WZY0kwEUW4Uzi5ppXm56PCIdKTUu', 'Blair Biller');

INSERT INTO user_roles (user_id, role) VALUES
  ('22222222-2222-2222-2222-222222222221', 'owner'),
  ('22222222-2222-2222-2222-222222222222', 'clinician'),
  ('22222222-2222-2222-2222-222222222223', 'biller');

INSERT INTO clinicians (id, tenant_id, user_id, npi) VALUES
  ('33333333-3333-3333-3333-333333333331', '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222', '1234567890');

INSERT INTO clients (id, tenant_id, first_name, last_name, dob, email) VALUES
  ('44444444-4444-4444-4444-444444444441', '11111111-1111-1111-1111-111111111111',
   'Jamie', 'Rivera', '1990-04-12', 'jamie@example.com'),
  ('44444444-4444-4444-4444-444444444442', '11111111-1111-1111-1111-111111111111',
   'Morgan', 'Lee', '1985-09-30', 'morgan@example.com');

INSERT INTO client_assignments (client_id, clinician_id) VALUES
  ('44444444-4444-4444-4444-444444444441', '33333333-3333-3333-3333-333333333331');

INSERT INTO insurance_payers (id, name, payer_id) VALUES
  ('55555555-5555-5555-5555-555555555551', 'Blue Shield CA', 'BS001');

INSERT INTO appointments (id, tenant_id, client_id, clinician_id, starts_at, ends_at, status) VALUES
  ('66666666-6666-6666-6666-666666666661', '11111111-1111-1111-1111-111111111111',
   '44444444-4444-4444-4444-444444444441', '33333333-3333-3333-3333-333333333331',
   now() + interval '1 day', now() + interval '1 day 50 minutes', 'booked');

INSERT INTO encounters (id, tenant_id, client_id, clinician_id, dos, cpt_codes, rate, status) VALUES
  ('77777777-7777-7777-7777-777777777771', '11111111-1111-1111-1111-111111111111',
   '44444444-4444-4444-4444-444444444441', '33333333-3333-3333-3333-333333333331',
   current_date - 7, ARRAY['90837'], 150.00, 'signed');

INSERT INTO claims (id, tenant_id, encounter_id, client_id, provider_id, payer_id, claim_number, dos, rate, status, expected_payout_date) VALUES
  ('88888888-8888-8888-8888-888888888881', '11111111-1111-1111-1111-111111111111',
   '77777777-7777-7777-7777-777777777771', '44444444-4444-4444-4444-444444444441',
   '33333333-3333-3333-3333-333333333331', '55555555-5555-5555-5555-555555555551',
   'CLM-2026-0001', current_date - 7, 150.00, 'submitted', current_date + 21);

INSERT INTO claim_status_history (tenant_id, claim_id, from_status, to_status, source) VALUES
  ('11111111-1111-1111-1111-111111111111', '88888888-8888-8888-8888-888888888881', 'draft', 'submitted', 'manual');
