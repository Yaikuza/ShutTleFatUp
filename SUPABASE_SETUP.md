# Supabase setup

1. Create a Supabase project.
2. Open **Authentication > Providers > Anonymous** and enable anonymous sign-ins.
3. Open **SQL Editor** and run [`supabase/schema.sql`](supabase/schema.sql).
   - Existing project: run only [`supabase/stats-migration.sql`](supabase/stats-migration.sql) to add permanent daily and round statistics.
4. Copy the Project URL and Publishable Key from **Project Settings > API**.
5. For local development, copy `.env.example` to `.env.local` and fill both values.
6. In GitHub, open **Settings > Secrets and variables > Actions > Variables** and add:
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
7. Push to `master` or manually run the Pages workflow.

Never add a secret key or service-role key to the repository, Vite variables, or GitHub Pages.

New rooms use a six-digit numeric code for easier entry on mobile. Existing alphanumeric room codes remain valid.
