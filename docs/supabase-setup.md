# CLICK OK — Supabase setup

The application uses Supabase Auth and PostgreSQL. It does not use the Replit-managed database for store or business records.

## Configure the project

1. Create a Supabase project.
2. Add the values shown in **Project Settings → API** to the Replit Secrets/environment settings:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_URL` (same project URL)
   - `SUPABASE_ANON_KEY` (same public anon key)
3. Keep `service_role` keys out of the browser, source files, and Git. The API server uses the anon key together with each user's access token, so database access is still governed by RLS.
4. Apply the SQL file in `supabase/migrations/` to the Supabase project's SQL editor or using the Supabase CLI.
5. In Supabase Auth, configure the allowed site URL and redirect URLs to include the app's development and published URLs.
6. Restart the web and API workflows after adding the settings.

## Current migration scope

The initial migration creates profiles, business workspaces, memberships, product categories and products, customers, orders, order-status history, and the row-level security policies needed by the first operational release. It also creates the atomic `create_business` function so workspace creation and owner membership cannot be split into inconsistent writes.

There is no seed data. An empty account remains empty until a business creates its own records.

## Security notes

- All store and business data is tied to `business_id`.
- Supabase RLS checks membership and role on reads and writes.
- The API verifies the Supabase access token and forwards it; it never uses a service-role key.
- Order status changes are checked by the API and recorded by a database trigger.
- Public storefront checkout, file uploads, billing, and the remaining operations modules are not part of this first release.
