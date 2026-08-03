-- Scheduling completeness: availability rules, recurring series, waitlist,
-- group/couple sessions, cancellation policy, and telehealth location capture.

-- ---------- clinician availability (drives self-booking) ----------
CREATE TABLE availability_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  clinician_id UUID NOT NULL REFERENCES clinicians(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),  -- 0 = Sunday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  slot_minutes INT NOT NULL DEFAULT 50,
  accepts_new BOOLEAN NOT NULL DEFAULT true,
  CHECK (end_time > start_time)
);
CREATE INDEX idx_avail_clin ON availability_rules (clinician_id, weekday);

-- one-off blocks (vacation, admin time)
CREATE TABLE availability_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  clinician_id UUID NOT NULL REFERENCES clinicians(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason TEXT
);

-- ---------- recurring appointment series ----------
CREATE TABLE appointment_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  clinician_id UUID NOT NULL REFERENCES clinicians(id),
  cadence TEXT NOT NULL DEFAULT 'weekly',    -- weekly | biweekly
  weekday SMALLINT NOT NULL,
  start_time TIME NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 50,
  starts_on DATE NOT NULL,
  ends_on DATE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES appointment_series(id);
-- cancellation policy + telehealth compliance
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS late_cancel_fee NUMERIC(10,2);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS client_state TEXT;   -- where the client physically is
ALTER TABLE clients ADD COLUMN IF NOT EXISTS emergency_contact JSONB;  -- {name, relationship, phone}
ALTER TABLE clients ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE clinicians ADD COLUMN IF NOT EXISTS licensed_states TEXT[] NOT NULL DEFAULT '{}';

-- ---------- group / couple / family sessions ----------
-- appointments keep client_id as the primary/billed client; participants add the rest.
CREATE TABLE appointment_participants (
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  role TEXT NOT NULL DEFAULT 'participant',   -- primary | participant
  PRIMARY KEY (appointment_id, client_id)
);

-- ---------- waitlist ----------
DROP TABLE IF EXISTS waitlist_entries CASCADE;
CREATE TABLE waitlist_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  clinician_id UUID REFERENCES clinicians(id),
  preferred_weekdays SMALLINT[] NOT NULL DEFAULT '{}',
  preferred_from TIME,
  preferred_to TIME,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'waiting',   -- waiting | offered | scheduled | removed
  offered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_waitlist_active ON waitlist_entries (tenant_id, status);

-- ---------- practice scheduling settings ----------
ALTER TABLE branding ADD COLUMN IF NOT EXISTS late_cancel_hours INT NOT NULL DEFAULT 24;
ALTER TABLE branding ADD COLUMN IF NOT EXISTS late_cancel_fee NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE branding ADD COLUMN IF NOT EXISTS booking_lead_hours INT NOT NULL DEFAULT 12;
ALTER TABLE branding ADD COLUMN IF NOT EXISTS booking_horizon_days INT NOT NULL DEFAULT 60;

-- ---------- RLS ----------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['availability_rules','availability_blocks','appointment_series',
                           'appointment_participants','waitlist_entries'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_tenant()) WITH CHECK (tenant_id = current_tenant())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_user', t);
  END LOOP;
END $$;

CREATE POLICY clinician_avail ON availability_rules AS RESTRICTIVE
  USING (NOT is_clinician() OR clinician_id = current_clinician());
CREATE POLICY clinician_series ON appointment_series AS RESTRICTIVE
  USING (NOT is_clinician() OR clinician_id = current_clinician());

-- portal: patients read availability to self-book, and see their own waitlist entries
CREATE POLICY portal_avail ON availability_rules AS RESTRICTIVE USING (true);
CREATE POLICY portal_waitlist ON waitlist_entries AS RESTRICTIVE
  USING (NOT is_client() OR client_id = current_client());

-- reminders gain an email channel
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS email TEXT;

DROP FUNCTION IF EXISTS fetch_due_reminders(INT);
CREATE FUNCTION fetch_due_reminders(p_limit INT DEFAULT 50)
RETURNS TABLE (id UUID, tenant_id UUID, message TEXT, channel TEXT,
               phone TEXT, email TEXT, sms_consent BOOLEAN)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT r.id, r.tenant_id, r.message, r.channel, c.phone, c.email, c.sms_consent
  FROM reminders r JOIN clients c ON c.id = r.client_id
  WHERE r.sent_at IS NULL AND r.send_at <= now() AND r.status = 'scheduled'
  ORDER BY r.send_at LIMIT p_limit
$$;
GRANT EXECUTE ON FUNCTION fetch_due_reminders(INT) TO app_user;

-- ---------- demo availability for the seeded clinician ----------
INSERT INTO availability_rules (tenant_id, clinician_id, weekday, start_time, end_time)
SELECT '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333331',
       d, '09:00', '17:00'
FROM generate_series(1, 5) AS d;

UPDATE clinicians SET licensed_states = ARRAY['CA','NY']
 WHERE id = '33333333-3333-3333-3333-333333333331';
UPDATE clients SET state = 'CA' WHERE tenant_id = '11111111-1111-1111-1111-111111111111';
