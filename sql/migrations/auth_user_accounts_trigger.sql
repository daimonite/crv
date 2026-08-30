-- ─────────────────────────────────────────────────────────────────────────
-- Auto-create an `accounts` row when a new Supabase auth user signs up.
--
-- Why this exists:
--   src/lib/actions/auth.ts documents that the `accounts` table is
--   "populated by a Supabase Database trigger on auth.users insert
--   (trigger must be configured in Supabase dashboard)" — but that trigger
--   was never checked into this repo, so a fresh Supabase project (or one
--   where the trigger was never manually added in the dashboard) has no
--   way to create it. Every new signup then has no matching `accounts` row,
--   which breaks:
--     - the web dashboard (blank/broken — every query does
--       accounts.select(...).eq('auth_user_id', user.id))
--     - the desktop POS "Link Admin Account" step in Onboarding.tsx, which
--       throws "No pharmacy account found for this login" and cannot
--       provision a branch at all.
--
--   src/app/auth/callback/route.ts now also has an application-level
--   fallback that creates the row idempotently if this trigger is missing,
--   but this trigger is the correct, race-free, canonical fix — apply it
--   once in the Supabase SQL editor (or via `supabase db push` / migrations)
--   for every environment (dev, staging, prod).
--
-- Run this once against your Supabase project's SQL editor.
-- Safe to re-run: uses CREATE OR REPLACE / DROP IF EXISTS.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.accounts (auth_user_id, name, type, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'entity_name', new.email),
    coalesce(new.raw_user_meta_data->>'account_type', 'pharmacy'),
    new.email
  )
  on conflict (auth_user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user();

-- NOTE: `on conflict (auth_user_id) do nothing` requires a unique
-- constraint/index on accounts.auth_user_id. If you don't already have one:
--   create unique index if not exists accounts_auth_user_id_key
--     on public.accounts (auth_user_id);
-- Without it, this trigger will error on every signup instead of just
-- skipping duplicates — check this before applying in production.
