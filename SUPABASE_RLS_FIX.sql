-- ============================================================
-- MAVTAT Motors - Supabase RLS (Row-Level Security) Security Fix
-- Project: mavtat-motors (hxzitmnskxanwwyqsdxj)
--
-- INSTRUCTIONS:
-- 1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/hxzitmnskxanwwyqsdxj/sql/new
-- 2. Paste this entire script into the SQL Editor.
-- 3. Click "Run".
-- ============================================================

-- 1. Enable Row-Level Security (RLS) on all public tables
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rental ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.fuel_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.fleet_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.closed_books ENABLE ROW LEVEL SECURITY;

-- 2. Force RLS to ensure table owners cannot bypass security rules via anonymous API requests
ALTER TABLE IF EXISTS public.users FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.vehicles FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payments FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rental ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.fuel_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.fleet_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.closed_books ENABLE ROW LEVEL SECURITY;

-- 3. Grant full access to Service Role (used by MAVTAT Express backend server)
-- Note: Service Role key automatically bypasses RLS, but explicit policies ensure clean security rules.
DO $$ 
DECLARE
    tbl text;
    tables text[] := ARRAY['users', 'sessions', 'vehicles', 'payments', 'maintenance', 'rental', 'fuel_logs', 'fleet_activities', 'trips', 'closed_books'];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Service Role Full Access" ON public.%I', tbl);
        EXECUTE format('CREATE POLICY "Service Role Full Access" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', tbl);
    END LOOP;
END $$;
