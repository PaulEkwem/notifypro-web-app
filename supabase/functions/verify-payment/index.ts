// @ts-nocheck
// NotifyPro — verify-payment Edge Function
//
// Called by the frontend after Monnify SDK fires onComplete.
// Verifies the payment server-to-server with Monnify, then credits
// the wallet. The frontend NEVER calls credit_wallet_atomic directly.
//
// Required Supabase secrets:
//   MONNIFY_API_KEY     — MK_TEST_... or MK_PROD_...
//   MONNIFY_SECRET_KEY  — your Monnify secret key
//   MONNIFY_IS_TEST     — "true" or "false"

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MONNIFY_BASE = () =>
  Deno.env.get("MONNIFY_IS_TEST") === "false"
    ? "https://api.monnify.com"
    : "https://sandbox.monnify.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true }, 200);

  try {
    // ── Auth — must be a signed-in user ──
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_ANON_KEY"),
      { global: { headers: { Authorization: req.headers.get("Authorization") } } }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    // ── Parse body ──
    let body;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

    const { paymentReference, creditAmount } = body;

    if (!paymentReference || typeof paymentReference !== "string") {
      return json({ error: "paymentReference is required" }, 400);
    }
    if (!creditAmount || typeof creditAmount !== "number" || creditAmount < 500) {
      return json({ error: "creditAmount must be a number ≥ 500" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    );

    // ── Idempotency — reject if this reference was already processed ──
    const { data: existing } = await admin
      .from("payment_verifications")
      .select("id, status")
      .eq("payment_reference", paymentReference)
      .maybeSingle();

    if (existing?.status === "credited") {
      return json({ error: "This payment has already been credited." }, 409);
    }

    // ── Get Monnify access token ──
    const apiKey    = Deno.env.get("MONNIFY_API_KEY");
    const secretKey = Deno.env.get("MONNIFY_SECRET_KEY");

    if (!apiKey || !secretKey) {
      return json({ error: "Payment provider not configured. Contact support." }, 503);
    }

    const basicAuth = btoa(`${apiKey}:${secretKey}`);

    const tokenRes = await fetch(`${MONNIFY_BASE()}/api/v1/auth/login`, {
      method:  "POST",
      headers: { Authorization: `Basic ${basicAuth}`, "Content-Type": "application/json" },
    });
    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.responseBody?.accessToken) {
      console.error("Monnify auth failed:", JSON.stringify(tokenData));
      return json({ error: "Could not authenticate with payment provider." }, 502);
    }

    const accessToken = tokenData.responseBody.accessToken;

    // ── Verify transaction with Monnify ──
    const verifyRes = await fetch(
      `${MONNIFY_BASE()}/api/v2/merchant/transactions/query?paymentReference=${encodeURIComponent(paymentReference)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const verifyData = await verifyRes.json();

    if (!verifyRes.ok || !verifyData.responseBody) {
      console.error("Monnify verify failed:", JSON.stringify(verifyData));
      return json({ error: "Could not verify payment. Contact support with reference: " + paymentReference }, 502);
    }

    const txn = verifyData.responseBody;

    // ── Validate payment status ──
    if (txn.paymentStatus !== "PAID") {
      return json({ error: `Payment not completed. Status: ${txn.paymentStatus}` }, 400);
    }

    // ── Validate amount — Monnify amount is the total charged (inc. fees) ──
    // We credit the base amount the user selected (creditAmount), not the total charged.
    // The amount paid must be >= creditAmount (covers base + fees).
    const amountPaid = txn.amountPaid ?? txn.amount ?? 0;
    if (amountPaid < creditAmount) {
      console.error(`Amount mismatch: paid ${amountPaid}, requested credit ${creditAmount}`);
      return json({ error: "Payment amount does not match. Contact support." }, 400);
    }

    // ── Record the reference first to prevent race-condition double-credit ──
    await admin.from("payment_verifications").upsert({
      payment_reference: paymentReference,
      user_id:           user.id,
      amount_paid:       amountPaid,
      credit_amount:     creditAmount,
      status:            "pending",
      created_at:        new Date().toISOString(),
    }, { onConflict: "payment_reference" });

    // ── Credit the wallet ──
    const { data: creditResult, error: creditErr } = await admin.rpc("credit_wallet_atomic", {
      p_user_id: user.id,
      p_amount:  creditAmount,
    });

    if (creditErr || !creditResult?.success) {
      console.error("credit_wallet_atomic error:", creditErr);
      return json({ error: "Wallet credit failed. Contact support with reference: " + paymentReference }, 500);
    }

    // ── Mark as credited ──
    await admin.from("payment_verifications").update({ status: "credited" })
      .eq("payment_reference", paymentReference);

    return json({ success: true, new_balance: creditResult.new_balance });

  } catch (err) {
    console.error("verify-payment error:", err);
    return json({ error: "Unexpected error. Please try again." }, 500);
  }
});

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
