/* ============================================================
   NotifyPro — Fix profile trigger

   Run this in Supabase SQL Editor.
   Replaces the complex trigger with a minimal safe version.
   The JS handles updating the full profile after OTP verify.
============================================================ */

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
