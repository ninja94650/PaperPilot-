# PaperPilot backend

## Primary provider
Supabase project: `ueiwxomoirmncomzyudu` (Mumbai / ap-south-1).

The app uses Supabase Auth with cookie-backed SSR sessions, Postgres metadata, and a private Storage bucket. The browser receives only the publishable key; never add a service-role or secret key to client code or a `NEXT_PUBLIC_` variable.

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEON_DATABASE_URL` (reserved for a future PostgreSQL fallback; server-side only)

## Schema

The migration creates profiles, documents and processing_jobs. All three tables enable RLS and scope rows to `auth.uid()`. The private `documents` Storage bucket scopes each object to the first path segment, which must equal the signed-in user's UUID.

## Auth configuration

In Supabase Authentication > URL Configuration, set the Site URL to the production PaperPilot URL and add the production and preview callback URLs ending in `/auth/callback` to Redirect URLs. Configure SMTP before expecting production email confirmations and password recovery to deliver reliably.

## Neon fallback

Neon is a PostgreSQL-only fallback for database workloads. It does not replace Supabase Auth or Storage. Do not automatically switch to Neon until a tested adapter and a migration/synchronization plan exist.
