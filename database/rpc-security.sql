-- ============================================================
--  NotifyPro — Security Migrations
--  Run once in Supabase SQL Editor or via Management API.
-- ============================================================

-- ── 1. ATOMIC WALLET DEDUCTION ─────────────────────────────
-- Locks the profile row, checks balance, deducts — all in one
-- transaction. Prevents double-spend race conditions.

CREATE OR REPLACE FUNCTION public.deduct_wallet_atomic(
  p_user_id UUID,
  p_amount   NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance NUMERIC;
BEGIN
  -- Lock row to prevent concurrent deductions
  SELECT wallet_balance INTO v_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE NOWAIT;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Insufficient balance. Need ₦%s, have ₦%s.', p_amount::TEXT, v_balance::TEXT),
      'balance', v_balance
    );
  END IF;

  UPDATE profiles
  SET wallet_balance = wallet_balance - p_amount
  WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true, 'new_balance', v_balance - p_amount);
END;
$$;

-- ── 2. ATOMIC WALLET CREDIT ────────────────────────────────
-- Single UPDATE so concurrent top-ups can't overwrite each other.

CREATE OR REPLACE FUNCTION public.credit_wallet_atomic(
  p_user_id UUID,
  p_amount   NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  UPDATE profiles
  SET wallet_balance = wallet_balance + p_amount
  WHERE id = p_user_id
  RETURNING wallet_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;

-- ── 3. ATOMIC CAMPAIGN DELIVERED INCREMENT ─────────────────
-- Called by termii-webhook to safely increment delivered count.

CREATE OR REPLACE FUNCTION public.increment_campaign_delivered(
  p_campaign_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE campaigns
  SET total_delivered = total_delivered + 1,
      updated_at      = NOW()
  WHERE id = p_campaign_id;
END;
$$;

-- ── 4. GRANT PERMISSIONS ───────────────────────────────────
-- deduct_wallet_atomic: only callable by service_role (edge functions)
REVOKE ALL ON FUNCTION public.deduct_wallet_atomic(UUID, NUMERIC) FROM PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.deduct_wallet_atomic(UUID, NUMERIC) TO service_role;

-- credit_wallet_atomic: callable by authenticated users (client-side top-up)
REVOKE ALL ON FUNCTION public.credit_wallet_atomic(UUID, NUMERIC) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.credit_wallet_atomic(UUID, NUMERIC) TO authenticated, service_role;

-- increment_campaign_delivered: only callable by service_role (webhook)
REVOKE ALL ON FUNCTION public.increment_campaign_delivered(UUID) FROM PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.increment_campaign_delivered(UUID) TO service_role;

-- ── 5. EXPLICIT DENY RLS ON messages ──────────────────────
-- Users read their own messages (existing policy kept).
-- All writes go through service_role in edge functions only.

DROP POLICY IF EXISTS "Users cannot insert messages"  ON messages;
DROP POLICY IF EXISTS "Users cannot update messages"  ON messages;
DROP POLICY IF EXISTS "Users cannot delete messages"  ON messages;

CREATE POLICY "Users cannot insert messages"
  ON messages FOR INSERT WITH CHECK (false);

CREATE POLICY "Users cannot update messages"
  ON messages FOR UPDATE USING (false);

CREATE POLICY "Users cannot delete messages"
  ON messages FOR DELETE USING (false);

-- ── 6. EXPLICIT DENY RLS ON wallet_transactions ────────────
DROP POLICY IF EXISTS "Users cannot insert wallet_transactions"  ON wallet_transactions;
DROP POLICY IF EXISTS "Users cannot update wallet_transactions"  ON wallet_transactions;
DROP POLICY IF EXISTS "Users cannot delete wallet_transactions"  ON wallet_transactions;

CREATE POLICY "Users cannot insert wallet_transactions"
  ON wallet_transactions FOR INSERT WITH CHECK (false);

CREATE POLICY "Users cannot update wallet_transactions"
  ON wallet_transactions FOR UPDATE USING (false);

CREATE POLICY "Users cannot delete wallet_transactions"
  ON wallet_transactions FOR DELETE USING (false);

-- ── 7. EXPLICIT DENY RLS ON campaigns ─────────────────────
-- Users may read their own campaigns but never write directly.
DROP POLICY IF EXISTS "Users cannot insert campaigns"  ON campaigns;
DROP POLICY IF EXISTS "Users cannot update campaigns"  ON campaigns;
DROP POLICY IF EXISTS "Users cannot delete campaigns"  ON campaigns;

CREATE POLICY "Users cannot insert campaigns"
  ON campaigns FOR INSERT WITH CHECK (false);

CREATE POLICY "Users cannot update campaigns"
  ON campaigns FOR UPDATE USING (false);

CREATE POLICY "Users cannot delete campaigns"
  ON campaigns FOR DELETE USING (false);
