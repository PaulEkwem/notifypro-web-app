/* ============================================
   NotifyPro — Supabase Client

   Steps to get your credentials:
   1. Go to https://supabase.com and create a project
   2. Go to Project Settings → API
   3. Copy "Project URL" and "anon / public" key below
   4. In Supabase → Authentication → Providers:
      - Enable Email (on by default)
      - Enable Google (needs Google OAuth Client ID + Secret)
   5. In Supabase → Authentication → URL Configuration:
      - Add your site URL (e.g. http://localhost:5500)
      - Add redirect URL: http://localhost:5500/pages/dashboard.html
============================================ */

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL      = "https://oilnrhqcfzkonoumsfav.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9pbG5yaHFjZnprb25vdW1zZmF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NDQ3MDgsImV4cCI6MjA5MDEyMDcwOH0.uvfoi4jljNwKazh5HCKYAXg1s5OAw-EwqEz624vI2yo";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
