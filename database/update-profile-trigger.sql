/* ============================================================
   NotifyPro — Updated profile trigger

   Run this in Supabase SQL Editor AFTER schema.sql.
   It replaces the basic trigger with one that pulls
   first_name, last_name, business_name, phone, and plan
   from the metadata passed during signUp().
============================================================ */

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  meta       JSONB := NEW.raw_user_meta_data;
  plan       TEXT  := COALESCE(meta->>'plan', 'starter');
  sms_cap    INTEGER;
BEGIN
  -- Set SMS limit based on plan
  sms_cap := CASE plan
    WHEN 'business'   THEN 30000
    WHEN 'enterprise' THEN -1
    ELSE 5000
  END;

  INSERT INTO profiles (
    id, email,
    first_name, last_name, business_name, phone,
    plan, sms_limit
  ) VALUES (
    NEW.id,
    NEW.email,
    meta->>'first_name',
    meta->>'last_name',
    meta->>'business_name',
    meta->>'phone',
    plan,
    sms_cap
  )
  ON CONFLICT (id) DO UPDATE SET
    first_name    = EXCLUDED.first_name,
    last_name     = EXCLUDED.last_name,
    business_name = EXCLUDED.business_name,
    phone         = EXCLUDED.phone,
    plan          = EXCLUDED.plan,
    sms_limit     = EXCLUDED.sms_limit,
    updated_at    = NOW();

  RETURN NEW;
END;
$$;
