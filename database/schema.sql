/* ============================================================
   NotifyPro — PostgreSQL Schema (Supabase)

   How to run:
   1. Go to your Supabase project → SQL Editor
   2. Paste this entire file and click Run
   3. All tables, indexes, RLS policies, and triggers
      will be created automatically.

   Tables:
   1.  profiles          — extends auth.users
   2.  contacts          — address book per user
   3.  contact_lists     — groups / segments
   4.  contact_list_members — join table
   5.  campaigns         — SMS / Email / OTP jobs
   6.  messages          — every individual delivery log
   7.  api_keys          — developer API credentials
   8.  wallet_transactions — top-ups and deductions
============================================================ */


-- ── EXTENSIONS ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()


-- ── 1. PROFILES ──────────────────────────────────────────────
-- One row per authenticated user.
-- Created automatically via trigger when a user signs up.

CREATE TABLE IF NOT EXISTS profiles (
  id              UUID        PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email           TEXT        NOT NULL,
  first_name      TEXT,
  last_name       TEXT,
  business_name   TEXT,
  phone           TEXT,
  plan            TEXT        NOT NULL DEFAULT 'starter'
                              CHECK (plan IN ('starter', 'business', 'enterprise')),
  wallet_balance  NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  sms_used        INTEGER     NOT NULL DEFAULT 0,
  sms_limit       INTEGER     NOT NULL DEFAULT 5000,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create a profile on sign-up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();


-- ── 2. CONTACTS ───────────────────────────────────────────────
-- Each user's address book.

CREATE TABLE IF NOT EXISTS contacts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  phone       TEXT,
  email       TEXT,
  tags        TEXT[]      DEFAULT '{}',
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts (user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone   ON contacts (phone);
CREATE INDEX IF NOT EXISTS idx_contacts_email   ON contacts (email);

CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();


-- ── 3. CONTACT LISTS ──────────────────────────────────────────
-- Named segments / groups.

CREATE TABLE IF NOT EXISTS contact_lists (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_lists_user_id ON contact_lists (user_id);


-- ── 4. CONTACT LIST MEMBERS ───────────────────────────────────
-- Many-to-many: contacts ↔ contact_lists

CREATE TABLE IF NOT EXISTS contact_list_members (
  list_id     UUID NOT NULL REFERENCES contact_lists (id) ON DELETE CASCADE,
  contact_id  UUID NOT NULL REFERENCES contacts (id)      ON DELETE CASCADE,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (list_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_clm_contact_id ON contact_list_members (contact_id);


-- ── 5. CAMPAIGNS ──────────────────────────────────────────────
-- A campaign is one batch send (SMS, Email, OTP, 2FA).

CREATE TABLE IF NOT EXISTS campaigns (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  type            TEXT        NOT NULL CHECK (type IN ('sms', 'email', 'otp', '2fa')),
  status          TEXT        NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled')),
  sender_id       TEXT,                   -- custom sender name / number
  subject         TEXT,                   -- email subject
  message         TEXT        NOT NULL,   -- SMS body or email HTML
  total_recipients INTEGER    NOT NULL DEFAULT 0,
  total_sent      INTEGER     NOT NULL DEFAULT 0,
  total_delivered INTEGER     NOT NULL DEFAULT 0,
  total_failed    INTEGER     NOT NULL DEFAULT 0,
  cost            NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  scheduled_at    TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns (user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status  ON campaigns (status);
CREATE INDEX IF NOT EXISTS idx_campaigns_type    ON campaigns (type);

CREATE TRIGGER campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();


-- ── 6. MESSAGES ───────────────────────────────────────────────
-- Individual delivery record for every SMS / email / OTP sent.

CREATE TABLE IF NOT EXISTS messages (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES profiles (id)  ON DELETE CASCADE,
  campaign_id   UUID        REFERENCES campaigns (id)          ON DELETE SET NULL,
  contact_id    UUID        REFERENCES contacts (id)           ON DELETE SET NULL,
  type          TEXT        NOT NULL CHECK (type IN ('sms', 'email', 'otp', '2fa')),
  recipient     TEXT        NOT NULL,   -- phone number or email address
  status        TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'expired', 'bounced')),
  network       TEXT,                   -- MTN, Airtel, Glo, 9mobile
  provider_ref  TEXT,                   -- telco / ESP message ID
  error_code    TEXT,
  cost          NUMERIC(8, 4) NOT NULL DEFAULT 0.00,
  sent_at       TIMESTAMPTZ,
  delivered_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_user_id     ON messages (user_id);
CREATE INDEX IF NOT EXISTS idx_messages_campaign_id ON messages (campaign_id);
CREATE INDEX IF NOT EXISTS idx_messages_status      ON messages (status);
CREATE INDEX IF NOT EXISTS idx_messages_type        ON messages (type);
CREATE INDEX IF NOT EXISTS idx_messages_created_at  ON messages (created_at DESC);


-- ── 7. API KEYS ───────────────────────────────────────────────
-- Developer API credentials. Full key shown once on creation,
-- only the hash is stored.

CREATE TABLE IF NOT EXISTS api_keys (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  key_prefix   TEXT        NOT NULL,   -- first 12 chars (e.g. npk_live_xxxx), shown in UI
  key_hash     TEXT        NOT NULL UNIQUE,  -- bcrypt hash of full key
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id  ON api_keys (user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys (key_hash);


-- ── 8. WALLET TRANSACTIONS ────────────────────────────────────
-- Every naira movement in or out of a user's wallet.

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  type        TEXT        NOT NULL CHECK (type IN ('topup', 'deduction', 'refund')),
  amount      NUMERIC(12, 2) NOT NULL,
  balance_after NUMERIC(12, 2) NOT NULL,
  description TEXT        NOT NULL,
  reference   TEXT        UNIQUE,      -- Paystack / Flutterwave reference
  campaign_id UUID        REFERENCES campaigns (id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_user_id    ON wallet_transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_created_at ON wallet_transactions (created_at DESC);


-- ── ROW LEVEL SECURITY (RLS) ──────────────────────────────────
-- Ensures users can ONLY access their own data.
-- Critical — do not skip this.

ALTER TABLE profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_lists       ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_list_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns           ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages            ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys            ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- contacts
CREATE POLICY "Users manage their own contacts"
  ON contacts FOR ALL USING (auth.uid() = user_id);

-- contact_lists
CREATE POLICY "Users manage their own lists"
  ON contact_lists FOR ALL USING (auth.uid() = user_id);

-- contact_list_members
CREATE POLICY "Users manage their own list members"
  ON contact_list_members FOR ALL
  USING (
    list_id IN (SELECT id FROM contact_lists WHERE user_id = auth.uid())
  );

-- campaigns
CREATE POLICY "Users manage their own campaigns"
  ON campaigns FOR ALL USING (auth.uid() = user_id);

-- messages
CREATE POLICY "Users view their own messages"
  ON messages FOR SELECT USING (auth.uid() = user_id);

-- api_keys
CREATE POLICY "Users manage their own API keys"
  ON api_keys FOR ALL USING (auth.uid() = user_id);

-- wallet_transactions
CREATE POLICY "Users view their own transactions"
  ON wallet_transactions FOR SELECT USING (auth.uid() = user_id);
