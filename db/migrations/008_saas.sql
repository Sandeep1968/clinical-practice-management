-- SaaS administration: plans, subscriptions, tenant self-signup, password reset,
-- and a platform (super-admin) console that spans tenants.

-- ---------- plans & subscriptions ----------
CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  price_per_seat NUMERIC(10,2) NOT NULL,
  max_clinicians INT,
  features JSONB NOT NULL DEFAULT '[]',
  active BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO plans (code, name, price_per_seat, max_clinicians, features) VALUES
  ('starter', 'Starter', 49.00, 2,
   '["Scheduling & queue","Patient records","Digital prescriptions","Invoicing"]'),
  ('professional', 'Professional', 89.00, 10,
   '["Everything in Starter","Insurance eligibility","Claims & ERA posting","AI clinical notes","Analytics"]'),
  ('enterprise', 'Enterprise', 129.00, NULL,
   '["Everything in Professional","Unlimited clinicians","Patient portal","Priority support","SSO (roadmap)"]');

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id),
  seats INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'trialing',   -- trialing|active|past_due|cancelled
  trial_ends_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ
);
CREATE INDEX idx_subs_tenant ON subscriptions (tenant_id);

-- platform super-admins (cross-tenant; separate from practice users)
CREATE TABLE platform_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- password reset tokens (staff users)
CREATE TABLE password_resets (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

GRANT SELECT ON plans TO app_user;
GRANT SELECT, INSERT, UPDATE ON subscriptions TO app_user;

-- ---------- tenant self-signup ----------
-- Creates practice + owner user + clinician profile + trial subscription atomically.
-- SECURITY DEFINER: runs before any tenant context exists.
CREATE FUNCTION signup_practice(
  p_practice TEXT, p_subdomain TEXT, p_full_name TEXT,
  p_email TEXT, p_password_hash TEXT, p_plan TEXT DEFAULT 'professional'
) RETURNS TABLE (tenant_id UUID, user_id UUID)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_tenant UUID; v_user UUID; v_plan UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM tenants WHERE subdomain = lower(p_subdomain)) THEN
    RAISE EXCEPTION 'subdomain already taken';
  END IF;

  INSERT INTO tenants (name, subdomain, plan)
    VALUES (p_practice, lower(p_subdomain), p_plan) RETURNING id INTO v_tenant;

  INSERT INTO users (tenant_id, email, password_hash, full_name)
    VALUES (v_tenant, lower(p_email), p_password_hash, p_full_name) RETURNING id INTO v_user;

  INSERT INTO user_roles (user_id, role) VALUES (v_user, 'owner');
  -- owner is also a treating provider by default; harmless if unused
  INSERT INTO clinicians (tenant_id, user_id) VALUES (v_tenant, v_user);

  SELECT id INTO v_plan FROM plans WHERE code = p_plan;
  INSERT INTO subscriptions (tenant_id, plan_id, seats, status, trial_ends_at)
    VALUES (v_tenant, v_plan, 1, 'trialing', now() + interval '14 days');

  RETURN QUERY SELECT v_tenant, v_user;
END $$;
GRANT EXECUTE ON FUNCTION signup_practice(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO app_user;

-- ---------- password reset ----------
CREATE FUNCTION request_password_reset(p_subdomain TEXT, p_email TEXT, p_token TEXT)
RETURNS TABLE (found BOOLEAN, full_name TEXT, phone TEXT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_user UUID; v_name TEXT;
BEGIN
  SELECT u.id, u.full_name INTO v_user, v_name
  FROM users u JOIN tenants t ON t.id = u.tenant_id
  WHERE t.subdomain = p_subdomain AND lower(u.email) = lower(p_email) AND u.status = 'active';

  IF v_user IS NULL THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::TEXT;  -- caller must not reveal this
  ELSE
    INSERT INTO password_resets (token, user_id, expires_at)
      VALUES (p_token, v_user, now() + interval '30 minutes');
    RETURN QUERY SELECT true, v_name, NULL::TEXT;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION request_password_reset(TEXT,TEXT,TEXT) TO app_user;

CREATE FUNCTION consume_password_reset(p_token TEXT, p_password_hash TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_user UUID;
BEGIN
  SELECT user_id INTO v_user FROM password_resets
   WHERE token = p_token AND used_at IS NULL AND expires_at > now();
  IF v_user IS NULL THEN RETURN false; END IF;
  UPDATE users SET password_hash = p_password_hash WHERE id = v_user;
  UPDATE password_resets SET used_at = now() WHERE token = p_token;
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION consume_password_reset(TEXT,TEXT) TO app_user;

-- ---------- platform (super-admin) console ----------
CREATE FUNCTION platform_login_lookup(p_email TEXT)
RETURNS TABLE (id UUID, email TEXT, password_hash TEXT, full_name TEXT)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT a.id, a.email, a.password_hash, a.full_name
  FROM platform_admins a WHERE lower(a.email) = lower(p_email) AND a.status = 'active'
$$;
GRANT EXECUTE ON FUNCTION platform_login_lookup(TEXT) TO app_user;

CREATE FUNCTION platform_practices()
RETURNS TABLE (tenant_id UUID, name TEXT, subdomain TEXT, status TEXT,
               plan_name TEXT, seats INT, sub_status TEXT, trial_ends_at TIMESTAMPTZ,
               clinicians INT, patients INT, created_at TIMESTAMPTZ)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT t.id, t.name, t.subdomain, t.status,
         p.name, s.seats, s.status, s.trial_ends_at,
         (SELECT count(*)::int FROM clinicians c WHERE c.tenant_id = t.id),
         (SELECT count(*)::int FROM clients cl WHERE cl.tenant_id = t.id),
         t.created_at
  FROM tenants t
  LEFT JOIN subscriptions s ON s.tenant_id = t.id AND s.cancelled_at IS NULL
  LEFT JOIN plans p ON p.id = s.plan_id
  ORDER BY t.created_at DESC
$$;
GRANT EXECUTE ON FUNCTION platform_practices() TO app_user;

CREATE FUNCTION platform_metrics()
RETURNS TABLE (practices INT, active_practices INT, clinicians INT, patients INT,
               appointments_30d INT, mrr NUMERIC)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT (SELECT count(*)::int FROM tenants),
         (SELECT count(*)::int FROM tenants WHERE status = 'active'),
         (SELECT count(*)::int FROM clinicians),
         (SELECT count(*)::int FROM clients),
         (SELECT count(*)::int FROM appointments WHERE starts_at > now() - interval '30 days'),
         (SELECT coalesce(sum(s.seats * p.price_per_seat), 0)::numeric(12,2)
            FROM subscriptions s JOIN plans p ON p.id = s.plan_id
           WHERE s.status IN ('active','trialing') AND s.cancelled_at IS NULL)
$$;
GRANT EXECUTE ON FUNCTION platform_metrics() TO app_user;

CREATE FUNCTION platform_set_practice_status(p_tenant UUID, p_status TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE tenants SET status = p_status WHERE id = p_tenant
$$;
GRANT EXECUTE ON FUNCTION platform_set_practice_status(UUID, TEXT) TO app_user;

CREATE FUNCTION platform_change_plan(p_tenant UUID, p_plan_code TEXT, p_seats INT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_plan UUID;
BEGIN
  SELECT id INTO v_plan FROM plans WHERE code = p_plan_code;
  IF v_plan IS NULL THEN RAISE EXCEPTION 'unknown plan'; END IF;
  UPDATE subscriptions SET plan_id = v_plan, seats = greatest(p_seats, 1), status = 'active'
   WHERE tenant_id = p_tenant AND cancelled_at IS NULL;
  UPDATE tenants SET plan = p_plan_code WHERE id = p_tenant;
END $$;
GRANT EXECUTE ON FUNCTION platform_change_plan(UUID, TEXT, INT) TO app_user;

-- demo: subscription for the seeded practice + a platform admin
-- password for admin@clinicos.app is Demo1234! (same bcrypt hash as demo users)
INSERT INTO subscriptions (tenant_id, plan_id, seats, status)
  SELECT '11111111-1111-1111-1111-111111111111', id, 3, 'active' FROM plans WHERE code = 'professional';

INSERT INTO platform_admins (email, password_hash, full_name) VALUES
  ('admin@clinicos.app', '$2a$10$/eVpdNUdxA0dJSjB8smtJOCj/WZY0kwEUW4Uzi5ppXm56PCIdKTUu', 'Platform Admin');
