-- MFA (TOTP) + SMS reminders with TCPA consent

ALTER TABLE users ADD COLUMN mfa_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE clients ADD COLUMN sms_consent BOOLEAN NOT NULL DEFAULT false;  -- TCPA: explicit opt-in required

CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id),
  channel TEXT NOT NULL DEFAULT 'sms',
  message TEXT NOT NULL,
  send_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'scheduled',  -- scheduled|sent|failed|skipped_no_consent
  provider_ref TEXT
);
CREATE INDEX idx_reminders_due ON reminders (send_at) WHERE sent_at IS NULL;

ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON reminders
  USING (tenant_id = current_tenant()) WITH CHECK (tenant_id = current_tenant());
GRANT SELECT, INSERT, UPDATE ON reminders TO app_user;

-- login lookup now needs MFA fields (return shape changes → drop + recreate)
DROP FUNCTION IF EXISTS auth_login_lookup(TEXT, TEXT);
CREATE FUNCTION auth_login_lookup(p_subdomain TEXT, p_email TEXT)
RETURNS TABLE (id UUID, tenant_id UUID, email TEXT, password_hash TEXT,
               full_name TEXT, role user_role, clinician_id UUID,
               mfa_enabled BOOLEAN, mfa_secret TEXT)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT u.id, u.tenant_id, u.email, u.password_hash, u.full_name,
         (SELECT ur.role FROM user_roles ur WHERE ur.user_id = u.id
          ORDER BY CASE ur.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1
                   WHEN 'biller' THEN 2 WHEN 'clinician' THEN 3 ELSE 4 END
          LIMIT 1),
         c.id, u.mfa_enabled, u.mfa_secret
  FROM users u
  JOIN tenants t ON t.id = u.tenant_id
  LEFT JOIN clinicians c ON c.user_id = u.id
  WHERE t.subdomain = p_subdomain AND lower(u.email) = lower(p_email)
    AND u.status = 'active' AND t.status = 'active'
$$;
GRANT EXECUTE ON FUNCTION auth_login_lookup(TEXT, TEXT) TO app_user;

-- System worker functions (cross-tenant, SECURITY DEFINER, tightly scoped)
CREATE FUNCTION fetch_due_reminders(p_limit INT DEFAULT 50)
RETURNS TABLE (id UUID, tenant_id UUID, message TEXT, phone TEXT, sms_consent BOOLEAN)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT r.id, r.tenant_id, r.message, c.phone, c.sms_consent
  FROM reminders r JOIN clients c ON c.id = r.client_id
  WHERE r.sent_at IS NULL AND r.send_at <= now() AND r.status = 'scheduled'
  ORDER BY r.send_at LIMIT p_limit
$$;
GRANT EXECUTE ON FUNCTION fetch_due_reminders(INT) TO app_user;

CREATE FUNCTION mark_reminder(p_id UUID, p_status TEXT, p_ref TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE reminders SET sent_at = now(), status = p_status, provider_ref = p_ref WHERE id = p_id
$$;
GRANT EXECUTE ON FUNCTION mark_reminder(UUID, TEXT, TEXT) TO app_user;
