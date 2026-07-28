-- ============================================================
-- MAVTAT Motors - Supabase RLS (Row-Level Security) Security Fix
-- Project: mavtat-motors (hxzitmnskxanwwyqsdxj)
--
-- INSTRUCTIONS:
-- 1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/hxzitmnskxanwwyqsdxj/sql/new
-- 2. Paste this entire script into the SQL Editor.
-- 3. Click "Run".
-- ============================================================

DO $$ 
DECLARE
    r RECORD;
BEGIN
    -- Automatically find all BASE TABLES in the public schema (skipping VIEWs like fleet_activities)
    FOR r IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
    LOOP
        -- Enable Row-Level Security (RLS)
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.table_name);
        
        -- Force RLS so table owners/anon keys cannot bypass security
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', r.table_name);
        
        -- Grant full access to Service Role (used by Express backend server)
        EXECUTE format('DROP POLICY IF EXISTS "Service Role Full Access" ON public.%I;', r.table_name);
        EXECUTE format('CREATE POLICY "Service Role Full Access" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);', r.table_name);
    END LOOP;
END $$;
