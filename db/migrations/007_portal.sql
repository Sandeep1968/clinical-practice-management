-- Client (patient) portal: auth lookup + RLS so a portal session sees only its own rows

CREATE OR REPLACE FUNCTION is_client() RETURNS BOOLEAN
  LANGUAGE sql STABLE AS $$ SELECT current_setting('app.user_role', true) = 'client' $$;

CREATE OR REPLACE FUNCTION current_client() RETURNS UUID
  LANGUAGE sql STABLE AS $$ SELECT current_setting('app.client_id', true)::uuid $$;

-- Restrictive (ANDed) policies: no-ops for staff, hard scoping for portal sessions
CREATE POLICY portal_self ON clients AS RESTRICTIVE
  USING (NOT is_client() OR id = current_client());
CREATE POLICY portal_appts ON appointments AS RESTRICTIVE
  USING (NOT is_client() OR client_id = current_client());
CREATE POLICY portal_rx ON prescriptions AS RESTRICTIVE
  USING (NOT is_client() OR client_id = current_client());
CREATE POLICY portal_inv ON invoices AS RESTRICTIVE
  USING (NOT is_client() OR client_id = current_client());

-- Portal login: email + DOB identity check (scaffold).
-- PRODUCTION: replace with email/SMS OTP or password + OTP.
CREATE FUNCTION portal_login_lookup(p_subdomain TEXT, p_email TEXT, p_dob DATE)
RETURNS TABLE (client_id UUID, tenant_id UUID, name TEXT)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT c.id, c.tenant_id, c.first_name || ' ' || c.last_name
  FROM clients c JOIN tenants t ON t.id = c.tenant_id
  WHERE t.subdomain = p_subdomain AND lower(c.email) = lower(p_email)
    AND c.dob = p_dob AND c.status = 'active' AND t.status = 'active'
$$;
GRANT EXECUTE ON FUNCTION portal_login_lookup(TEXT, TEXT, DATE) TO app_user;
