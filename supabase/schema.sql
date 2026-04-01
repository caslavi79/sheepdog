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
  service_line text,
  stage text,
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
  venue_name text,
  event_type text,
  date text,
  created_at timestamptz DEFAULT now()
);

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

-- Stub tables (exist but not yet populated)
CREATE TABLE IF NOT EXISTS public.contracts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS public.placements (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz DEFAULT now());
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
  doc_type text NOT NULL DEFAULT 'other',
  status text DEFAULT 'missing',
  signature_date date,
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
END $$;

-- rate_limits: NO policies — only accessible via service role key (edge function)

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup ON public.rate_limits (ip, endpoint, created_at);
CREATE INDEX IF NOT EXISTS idx_pipeline_stage ON public.pipeline (stage);
CREATE INDEX IF NOT EXISTS idx_pipeline_created ON public.pipeline (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_created ON public.contact_submissions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clients_service_line ON public.clients (service_line);
CREATE INDEX IF NOT EXISTS idx_clients_status ON public.clients (status);
