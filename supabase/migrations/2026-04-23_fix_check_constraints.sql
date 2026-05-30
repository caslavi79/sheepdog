-- Fix DB check constraints that reject values the React app writes.
-- Discovered 2026-04-23 via live-DB constraint probing after finding that
-- contractor_docs.status rejected 'missing' (fixed separately by switching app to 'pending').
--
-- These 3 constraints are too narrow vs. what the app writes, so user actions
-- fail silently (insert/update returns error, but app doesn't surface it).
-- Safe to run multiple times — DROP IF EXISTS.

-- 1. events.status — DB accepts (confirmed, completed, cancelled) only.
--    App uses 'scheduled' as DEFAULT for every new event, plus 'in_progress'
--    during live events. With the old constraint, Scheduling was unable to
--    create any event with default status. 0 events exist in prod, so no
--    backfill needed.
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_status_check;
ALTER TABLE public.events ADD CONSTRAINT events_status_check
  CHECK (status IN ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled'));

-- 2. placements.status — DB accepts (active, pending) only.
--    App uses 'active', 'paused', 'ended'. Users picking Paused/Ended from the
--    placement dropdown would fail silently. 0 placements exist in prod.
ALTER TABLE public.placements DROP CONSTRAINT IF EXISTS placements_status_check;
ALTER TABLE public.placements ADD CONSTRAINT placements_status_check
  CHECK (status IN ('active', 'paused', 'ended'));

-- 3. invoices.service_line — DB accepts (events, staffing) only.
--    App dropdown includes 'both' (for invoices that cover both event + staffing
--    work on a mixed engagement). Users picking 'both' would fail silently.
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_service_line_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_service_line_check
  CHECK (service_line IN ('events', 'staffing', 'both'));
