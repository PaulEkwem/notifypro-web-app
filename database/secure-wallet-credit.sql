-- ============================================================
-- NotifyPro — Secure wallet credit migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Create payment_verifications table for idempotency
--    Prevents a payment reference from being credited twice.
CREATE TABLE IF NOT EXISTS public.payment_verifications (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_reference text        NOT NULL UNIQUE,
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_paid       numeric     NOT NULL,
  credit_amount     numeric     NOT NULL,
  status            text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'credited', 'failed')),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_payment_verifications_ref
  ON public.payment_verifications(payment_reference);

CREATE INDEX IF NOT EXISTS idx_payment_verifications_user
  ON public.payment_verifications(user_id);

-- 2. Enable RLS — users can only see their own records
ALTER TABLE public.payment_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_see_own_payments"
  ON public.payment_verifications
  FOR SELECT
  USING (auth.uid() = user_id);

-- Only service_role can insert/update (edge function uses service role key)
-- No INSERT/UPDATE policy for authenticated = blocked

-- 3. Revoke credit_wallet_atomic from authenticated role
--    Only the edge function (service_role) can call it now.
REVOKE EXECUTE ON FUNCTION public.credit_wallet_atomic(uuid, numeric) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.credit_wallet_atomic(uuid, numeric) FROM anon;

-- Confirm service_role still has access (it does by default, but be explicit)
GRANT EXECUTE ON FUNCTION public.credit_wallet_atomic(uuid, numeric) TO service_role;
