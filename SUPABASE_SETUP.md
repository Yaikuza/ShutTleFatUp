# Supabase setup

1. Create a Supabase project.
2. Open **Authentication > Providers > Anonymous** and enable anonymous sign-ins.
3. Open **SQL Editor** and run [`supabase/schema.sql`](supabase/schema.sql).
   - Existing project: run only [`supabase/stats-migration.sql`](supabase/stats-migration.sql) to add permanent daily and round statistics.
   - Then run [`supabase/realtime-actions-migration.sql`](supabase/realtime-actions-migration.sql) to allow safe editing from multiple devices.
   - Run [`supabase/play-events-migration.sql`](supabase/play-events-migration.sql) to add play-day registration, public RSVP links, court check-in, and match Session IDs.
4. Copy the Project URL and Publishable Key from **Project Settings > API**.
5. For local development, copy `.env.example` to `.env.local` and fill both values.
6. In GitHub, open **Settings > Secrets and variables > Actions > Variables** and add:
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
7. Push to `master` or manually run the Pages workflow.

Never add a secret key or service-role key to the repository, Vite variables, or GitHub Pages.

Users choose a six-digit numeric code when creating a room. That code is also the room name used for joining. Existing alphanumeric room codes remain valid.
