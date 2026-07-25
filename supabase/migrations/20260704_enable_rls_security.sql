-- Tier 1 security hardening: lock down the public database so the browser's anon key can
-- no longer read or write vote data directly via PostgREST. After this runs, ALL vote
-- traffic must go through backend/app.py, which uses the service-role key (bypasses RLS)
-- and verifies each caller's JWT before touching the DB.
--
-- ⚠️ CUTOVER ORDER — DO NOT run this until the new backend is LIVE:
--   1. Set SUPABASE_SERVICE_ROLE_KEY in Render's environment variables.
--   2. Commit + push so Render (backend) and Netlify (frontend) redeploy.
--   3. Confirm voting works on the live site (backend now uses the service-role key).
--   4. THEN apply this migration.
-- Running it earlier breaks live voting, because the currently-deployed backend still uses
-- the anon key, which RLS (with no policies below) will deny.
--
-- profiles + sites are intentionally untouched: they already have correct RLS
-- (profiles = own-row policies, sites = public read).

-- Enable RLS with NO policies → denies anon & authenticated roles entirely.
-- The service-role key used by the backend bypasses RLS, so backend access is unaffected.
alter table public.votes        enable row level security;
alter table public.vote_events  enable row level security;
alter table public.suggestions  enable row level security;
alter table public.submissions  enable row level security;

-- The research views expose vote data — and vote_research_view joins profiles PII, while
-- site_vote_summary exposes supporter/opposer user-id arrays. Postgres views run with the
-- view owner's privileges, so enabling RLS on the base tables above is NOT enough to stop
-- the anon key reading these views. Revoke the API roles' access explicitly; the backend
-- (service role) and the project owner (SQL editor) are unaffected.
revoke select on public.vote_research_view from anon, authenticated;
revoke select on public.site_vote_summary  from anon, authenticated;
