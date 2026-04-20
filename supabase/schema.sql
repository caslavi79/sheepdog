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

-- Stripe-related columns on invoices (added for online payment support)
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_link_token uuid UNIQUE DEFAULT gen_random_uuid();
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS allow_card boolean DEFAULT true;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS allow_ach boolean DEFAULT true;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS surcharge_amount numeric DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_invoices_pay_token ON public.invoices (payment_link_token);
CREATE INDEX IF NOT EXISTS idx_invoices_stripe_pi ON public.invoices (stripe_payment_intent_id);

-- =============================================================================
-- STRIPE PAYMENT PROCESSING
-- =============================================================================

-- Maps internal clients to Stripe Customer records. One row per client once they
-- make their first online payment (lazily created by stripe-payment-intent fn).
--
-- client_id uses ON DELETE SET NULL (not CASCADE) so payment history stays
-- reconcilable even if the internal client record is deleted. Stripe retains
-- the Customer object on their side regardless.
CREATE TABLE IF NOT EXISTS public.stripe_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid UNIQUE REFERENCES public.clients(id) ON DELETE SET NULL,
  stripe_customer_id text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_customers_client ON public.stripe_customers (client_id);
CREATE INDEX IF NOT EXISTS idx_stripe_customers_sc ON public.stripe_customers (stripe_customer_id);

-- One row per PaymentIntent attempt. Updated by the webhook as events arrive.
-- Method values: 'card', 'card_debit', 'us_bank_account', 'link', 'other'
-- Status mirrors Stripe PI statuses: requires_payment_method, processing,
-- requires_action, succeeded, canceled, failed.
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  stripe_payment_intent_id text UNIQUE NOT NULL,
  stripe_charge_id text,
  stripe_customer_id text,
  amount numeric NOT NULL,              -- total charged (invoice total + surcharge)
  base_amount numeric NOT NULL,         -- invoice total before surcharge
  surcharge_amount numeric DEFAULT 0,   -- card surcharge passed to payer
  stripe_fee numeric,                   -- Stripe's processing fee (filled by webhook)
  net_amount numeric,                   -- amount - stripe_fee (what we actually receive)
  method text,                          -- 'card', 'card_debit', 'us_bank_account', etc.
  card_brand text,                      -- visa, mastercard, amex, discover (if card)
  card_last4 text,
  card_funding text,                    -- 'credit', 'debit', 'prepaid', 'unknown'
  status text DEFAULT 'requires_payment_method',
  receipt_url text,
  failure_code text,
  failure_message text,
  refunded_amount numeric DEFAULT 0,
  dispute_status text,                  -- 'warning_needs_response', 'lost', 'won', etc.
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice ON public.payments (invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_client ON public.payments (client_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments (status);
CREATE INDEX IF NOT EXISTS idx_payments_created ON public.payments (created_at DESC);
-- Webhook handlers (charge.refunded, charge.dispute.*) filter by charge id; without
-- this index every such event scans the full payments table.
CREATE INDEX IF NOT EXISTS idx_payments_stripe_charge ON public.payments (stripe_charge_id);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_customer ON public.payments (stripe_customer_id);

-- Webhook event log — primarily for idempotency. Stripe can redeliver events;
-- we reject any event whose stripe_event_id we've already processed.
CREATE TABLE IF NOT EXISTS public.stripe_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text UNIQUE NOT NULL,
  event_type text NOT NULL,
  payload jsonb,
  processed_at timestamptz,
  error text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_type ON public.stripe_events (event_type);
CREATE INDEX IF NOT EXISTS idx_stripe_events_created ON public.stripe_events (created_at DESC);

-- Placeholder for future Stripe Connect (paying out security staff as contractors).
-- Schema is ready but no code path uses it yet. When enabling Connect:
--   1. Create Stripe Express connected accounts for each staff member
--   2. Populate stripe_account_id
--   3. Flip destination charges in stripe-payment-intent (commented TODO there)
--
-- staff_id uses ON DELETE RESTRICT (not CASCADE) — cascading staff deletion would
-- orphan the Stripe-side connected account without closing it, creating payout
-- reconciliation problems. Admins must explicitly resolve (close or reassign)
-- the Connect account before deleting the staff row.
CREATE TABLE IF NOT EXISTS public.stripe_connect_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid UNIQUE REFERENCES public.staff(id) ON DELETE RESTRICT,
  stripe_account_id text UNIQUE NOT NULL,
  account_type text DEFAULT 'express', -- 'express', 'standard', 'custom'
  onboarding_complete boolean DEFAULT false,
  charges_enabled boolean DEFAULT false,
  payouts_enabled boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_connect_staff ON public.stripe_connect_accounts (staff_id);

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
ALTER TABLE public.stripe_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_connect_accounts ENABLE ROW LEVEL SECURITY;

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
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated only' AND tablename = 'stripe_customers') THEN
    CREATE POLICY "authenticated only" ON public.stripe_customers FOR ALL USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated only' AND tablename = 'payments') THEN
    CREATE POLICY "authenticated only" ON public.payments FOR ALL USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'authenticated only' AND tablename = 'stripe_connect_accounts') THEN
    CREATE POLICY "authenticated only" ON public.stripe_connect_accounts FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- stripe_events: NO policies — only written by edge functions via service role key

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
