-- Secure messaging, broadcasts, and in-app notifications

CREATE TABLE message_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  subject TEXT NOT NULL DEFAULT 'Message',
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_threads_client ON message_threads (tenant_id, client_id, last_message_at DESC);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  thread_id UUID NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  sender_kind TEXT NOT NULL,              -- 'staff' | 'client'
  sender_user_id UUID REFERENCES users(id),
  body TEXT NOT NULL,
  read_by_staff_at TIMESTAMPTZ,
  read_by_client_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_thread ON messages (thread_id, created_at);

CREATE TABLE broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  sent_by UUID REFERENCES users(id),
  channel TEXT NOT NULL DEFAULT 'sms',    -- sms | portal
  audience TEXT NOT NULL DEFAULT 'all',   -- all | upcoming | outstanding_balance
  body TEXT NOT NULL,
  recipients INT NOT NULL DEFAULT 0,
  skipped INT NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,   -- null = whole practice
  role_scope user_role,                                   -- or target a role
  kind TEXT NOT NULL,                                     -- claim|note|message|appointment|system
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_unread ON notifications (tenant_id, created_at DESC) WHERE read_at IS NULL;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['message_threads','messages','broadcasts','notifications'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_tenant()) WITH CHECK (tenant_id = current_tenant())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_user', t);
  END LOOP;
END $$;

-- patients only see their own threads/messages
CREATE POLICY portal_threads ON message_threads AS RESTRICTIVE
  USING (NOT is_client() OR client_id = current_client());
CREATE POLICY portal_messages ON messages AS RESTRICTIVE
  USING (NOT is_client() OR EXISTS (
    SELECT 1 FROM message_threads t WHERE t.id = messages.thread_id AND t.client_id = current_client()));
-- clinicians: threads for their caseload
CREATE POLICY clinician_threads ON message_threads AS RESTRICTIVE
  USING (NOT is_clinician() OR EXISTS (
    SELECT 1 FROM client_assignments ca
     WHERE ca.client_id = message_threads.client_id AND ca.clinician_id = current_clinician() AND ca.ended_at IS NULL));
-- notifications: a user sees their own or their role's
CREATE POLICY notif_scope ON notifications AS RESTRICTIVE
  USING (
    NOT is_client()
    AND (user_id IS NULL OR user_id = current_setting('app.user_id', true)::uuid
         OR role_scope::text = current_setting('app.user_role', true))
  );

-- demo thread
INSERT INTO message_threads (id, tenant_id, client_id, subject)
VALUES ('bbbbbbbb-0000-0000-0000-00000000000b', '11111111-1111-1111-1111-111111111111',
        '44444444-4444-4444-4444-444444444441', 'Question about my medication');
INSERT INTO messages (tenant_id, thread_id, sender_kind, body, created_at) VALUES
  ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-00000000000b', 'client',
   'Hi — should I take the new medication in the morning or evening?', now() - interval '2 hours');

INSERT INTO notifications (tenant_id, role_scope, kind, title, body, link) VALUES
  ('11111111-1111-1111-1111-111111111111', 'clinician', 'message',
   'New patient message', 'Jamie Rivera asked a question about medication.', '/messages'),
  ('11111111-1111-1111-1111-111111111111', 'biller', 'claim',
   'Claim awaiting submission', 'A signed note released a claim to billing.', '/claims');
