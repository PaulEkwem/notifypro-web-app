DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'payment_verifications'
    AND policyname = 'users_see_own_payments'
  ) THEN
    CREATE POLICY users_see_own_payments
      ON public.payment_verifications
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.credit_wallet_atomic(uuid, numeric) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.credit_wallet_atomic(uuid, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.credit_wallet_atomic(uuid, numeric) TO service_role;
