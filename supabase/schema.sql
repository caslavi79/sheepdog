-- Sheepdog Database Schema
-- Exported from Supabase dashboard 2026-03-31
-- Project: sezzqhmsfulclcqmfwja
--
-- This file is the source of truth for the database schema.
-- To apply to a fresh Supabase project, run this entire file in the SQL editor.

-- =============================================================================
-- TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text,
  contact_name text NOT NULL,
  phone text,
  email text,
  address text,
  service_line text,
  client_type text,
  status text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contact_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  phone text,
  email text,
  company text,
  service text,
  message text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pipeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id),
  contact_name text,
  business_name text,
  phone text,
  email text,
  service_line text CHECK (service_line = ANY (ARRAY['events', 'staffing', 'both'])),
  stage text CHECK (stage = ANY (ARRAY['lead', 'outreach_sent', 'responded', 'meeting_scheduled', 'proposal_sent', 'under_contract', 'lost'])),
  value numeric,
  source text,
  notes text,
  next_action text,
  last_activity timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id),
  title text,
  venue_name text,
  event_type text,
  service_line text,
  date text,
  start_time time,
  end_time time,
  staff_needed integer DEFAULT 0,
  staff_assigned jsonb DEFAULT '[]',
  status text DEFAULT 'scheduled',
  invoice_id uuid REFERENCES public.invoices(id),
  placement_id uuid,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_date ON public.events (date);
CREATE INDEX IF NOT EXISTS idx_events_client ON public.events (client_id);
CREATE INDEX IF NOT EXISTS idx_events_status ON public.events (status);

CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id),
  service_line text,
  invoice_number text,
  line_items jsonb DEFAULT '[]',
  subtotal numeric DEFAULT 0,
  tax numeric DEFAULT 0,
  total numeric,
  status text,
  due_date date,
  payment_date date,
  payment_method text,
  notes text,
  internal_line_items jsonb DEFAULT '[]',
  internal_notes text,
  event_date date,
  event_start_time time,
  event_end_time time,
  venue_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_client ON public.invoices (client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices (status);
CREATE INDEX IF NOT EXISTS idx_invoices_created ON public.invoices (created_at DESC);

CREATE TABLE IF NOT EXISTS public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip text,
  endpoint text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id),
  staff_id uuid REFERENCES public.staff(id),
  template_name text NOT NULL DEFAULT '',
  title text,
  status text DEFAULT 'draft',
  field_values jsonb DEFAULT '{}',
  filled_html text,
  signer_name text,
  signer_email text,
  signature_data text,
  signed_at timestamptz,
  signer_ip text,
  sign_token uuid DEFAULT gen_random_uuid(),
  sent_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contracts_client ON public.contracts (client_id);
CREATE INDEX IF NOT EXISTS idx_contracts_staff ON public.contracts (staff_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON public.contracts (status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_contracts_token ON public.contracts (sign_token);
CREATE TABLE IF NOT EXISTS public.placements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id),
  title text,
  service_line text DEFAULT 'staffing',
  venue_name text,
  schedule_pattern text,
  start_date date,
  end_date date,
  default_start_time time,
  default_end_time time,
  staff_needed integer DEFAULT 0,
  default_staff jsonb DEFAULT '[]',
  status text DEFAULT 'active',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_placements_client ON public.placements (client_id);
CREATE INDEX IF NOT EXISTS idx_placements_status ON public.placements (status);
CREATE TABLE IF NOT EXISTS public.shifts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz DEFAULT now());

CREATE TABLE IF NOT EXISTS public.staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  phone text,
  email text,
  role text,
  default_pay_rate numeric,
  status text DEFAULT 'active',
  background_check text DEFAULT 'none',
  address text,
  city text,
  state text,
  zip text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_name ON public.staff (name);

CREATE TABLE IF NOT EXISTS public.licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid REFERENCES public.staff(id),
  license_type text NOT NULL DEFAULT 'general',
  license_number text,
  issuing_authority text,
  issue_date date,
  expiration_date date,
  status text DEFAULT 'active',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_licenses_staff ON public.licenses (staff_id);
CREATE INDEX IF NOT EXISTS idx_licenses_expiration ON public.licenses (expiration_date);

CREATE TABLE IF NOT EXISTS public.contractor_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid REFERENCES public.staff(id),
  contract_id uuid REFERENCES public.contracts(id),
  doc_type text NOT NULL DEFAULT 'other',
  status text DEFAULT 'missing',
  signature_date date,
  file_url text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contractor_docs_staff ON public.contractor_docs (staff_id);

CREATE TABLE IF NOT EXISTS public.pay_rate_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  service_line text NOT NULL,
  rate numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pay_rate_defaults_lookup ON public.pay_rate_defaults (role, service_line);

-- =============================================================================
-- CLAUDE AI INTEGRATION TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.assistant_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id uuid NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  action_type text,
  context_page text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assistant_messages_session ON public.assistant_messages (session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_assistant_messages_user ON public.assistant_messages (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.assistant_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES public.assistant_messages(id),
  action_type text NOT NULL,
  target_table text,
  target_id uuid,
  payload jsonb DEFAULT '{}',
  status text DEFAULT 'completed',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assistant_actions_message ON public.assistant_actions (message_id);
CREATE INDEX IF NOT EXISTS idx_assistant_actions_type ON public.assistant_actions (action_type, created_at DESC);

CREATE TABLE IF NOT EXISTS public.smart_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_type text NOT NULL,
  trigger_id uuid,
  recipient_email text NOT NULL,
  recipient_type text,
  subject text,
  html_body text,
  status text DEFAULT 'pending',
  sent_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_smart_emails_status ON public.smart_emails (status, created_at);
CREATE INDEX IF NOT EXISTS idx_smart_emails_trigger ON public.smart_emails (trigger_type, trigger_id);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pay_rate_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_emails ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read/write all ops tables
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated only' AND tablename = 'clients') THEN
    CREATE POLICY "authenticated only" ON public.clients FOR ALL USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated only' AND tablename = 'contact_submissions') THEN
    CREATE POLICY "authenticated only" ON public.contact_submissions FOR ALL USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated only' AND tablename = 'pipeline') THEN
    CREATE POLICY "authenticated only" ON public.pipeline FOR ALL USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated only' AND tablename = 'events') THEN
    CREATE POLICY "authenticated only" ON public.events FOR ALL USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated only' AND tablename = 'invoices') THEN
    CREATE POLICY "authenticated only" ON public.invoices FOR ALL USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated only' AND tablename = 'contractor_docs') THEN
    CREATE POLICY "authenticated only" ON public.contractor_docs FOR ALL USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated only' AND tablename = 'contracts') THEN
    CREATE POLICY "authenticated only" ON public.contracts FOR ALL USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated only' AND tablename = 'licenses') THEN
    CREATE POLICY "authenticated only" ON public.licenses FOR ALL USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated only' AND tablename = 'placements') THEN
    CREATE POLICY "authenticated only" ON public.placements FOR ALL USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated only' AND tablename = 'shifts') THEN
    CREATE POLICY "authenticated only" ON public.shifts FOR ALL USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated only' AND tablename = 'staff') THEN
    CREATE POLICY "authenticated only" ON public.staff FOR ALL USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated only' AND tablename = 'pay_rate_defaults') THEN
    CREATE POLICY "authenticated only" ON public.pay_rate_defaults FOR ALL USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated only' AND tablename = 'assistant_messages') THEN
    CREATE POLICY "authenticated only" ON public.assistant_messages FOR ALL USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated only' AND tablename = 'assistant_actions') THEN
    CREATE POLICY "authenticated only" ON public.assistant_actions FOR ALL USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated only' AND tablename = 'smart_emails') THEN
    CREATE POLICY "authenticated only" ON public.smart_emails FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- rate_limits: NO policies — only accessible via service role key (edge function)
-- smart_emails: also written by edge functions via service role key (cron triggers)

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup ON public.rate_limits (ip, endpoint, created_at);
CREATE INDEX IF NOT EXISTS idx_pipeline_stage ON public.pipeline (stage);
CREATE INDEX IF NOT EXISTS idx_pipeline_created ON public.pipeline (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_created ON public.contact_submissions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clients_service_line ON public.clients (service_line);
CREATE INDEX IF NOT EXISTS idx_clients_status ON public.clients (status);

-- =============================================================================
-- CRON JOBS (pg_cron + pg_net)
-- =============================================================================

-- Extensions (pg_cron is pre-enabled on Supabase, pg_net may need enabling)
-- CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
-- CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Daily claude-cron trigger at 8am CDT (13:00 UTC)
-- In winter (CST), fires at 7am local — still reasonable
-- To apply: run in SQL editor (cron.schedule requires superuser)
--
-- SELECT cron.schedule(
--   'claude-cron-daily',
--   '0 13 * * *',
--   $$
--   SELECT net.http_get(
--     url := 'https://sezzqhmsfulclcqmfwja.supabase.co/functions/v1/claude-cron',
--     headers := '{"Content-Type": "application/json"}'::jsonb
--   );
--   $$
-- );
--
-- Verify: SELECT * FROM cron.job;
-- Unschedule: SELECT cron.unschedule('claude-cron-daily');
