// NotifyPro — send-bulk-sms Edge Function
// Proxies bulk SMS sends through Termii, logs to DB, deducts wallet.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const RATE_PER_UNIT = 6; // ₦6 per SMS unit (1 unit = 160 chars)

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    // ── Auth: verify the caller is a logged-in NotifyPro user ──
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    // ── Parse request body ──
    const { recipients, message, campaignName, senderId } = await req.json();

    if (!Array.isArray(recipients) || recipients.length === 0 || !message) {
      return json({ error: "recipients (array) and message are required" }, 400);
    }

    // ── Check wallet balance ──
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("wallet_balance, sms_used, sms_limit")
      .eq("id", user.id)
      .single();

    if (profileErr || !profile) {
      return json({ error: "Could not load user profile" }, 500);
    }

    const units = recipients.length; // 1 unit per recipient (single-part messages)
    const cost = units * RATE_PER_UNIT;

    if ((profile.wallet_balance ?? 0) < cost) {
      return json(
        {
          error: `Insufficient balance. Need ₦${cost.toLocaleString()}, have ₦${(
            profile.wallet_balance ?? 0
          ).toLocaleString()}.`,
        },
        400
      );
    }

    // ── Call Termii API ──
    const TERMII_API_KEY = Deno.env.get("TERMII_API_KEY")!;
    const DEFAULT_SENDER = Deno.env.get("TERMII_SENDER_ID") || "N-Alert";
    const from = (senderId || DEFAULT_SENDER).trim();

    // Termii bulk endpoint accepts an array; single endpoint takes a string
    const isBulk = recipients.length > 1;
    const termiiUrl = isBulk
      ? "https://api.ng.termii.com/api/sms/send/bulk"
      : "https://api.ng.termii.com/api/sms/send";

    const termiiBody = {
      api_key: TERMII_API_KEY,
      to: isBulk ? recipients : recipients[0],
      from,
      sms: message,
      type: "plain",
      channel: "generic",
    };

    const termiiRes = await fetch(termiiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(termiiBody),
    });

    const termiiData = await termiiRes.json();

    // Termii returns code "ok" on success
    if (!termiiRes.ok || termiiData.code === "error") {
      console.error("Termii error:", termiiData);
      return json(
        { error: termiiData.message || "Termii API error — check your API key and sender ID" },
        502
      );
    }

    // ── Admin client for DB writes (bypasses RLS) ──
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Log campaign
    const { data: campaign } = await admin
      .from("campaigns")
      .insert({
        user_id: user.id,
        name: campaignName || "Bulk SMS Campaign",
        type: "sms",
        status: "sent",
        total_recipients: recipients.length,
        total_delivered: 0, // updated later via Termii delivery report webhook
        cost,
        sent_at: new Date().toISOString(),
      })
      .select()
      .single();

    // Log individual messages
    await admin.from("messages").insert(
      recipients.map((r: string) => ({
        user_id: user.id,
        campaign_id: campaign?.id ?? null,
        type: "sms",
        recipient: r,
        body: message,
        status: "sent",
        cost: RATE_PER_UNIT,
      }))
    );

    // Deduct wallet balance and increment sms_used
    await admin
      .from("profiles")
      .update({
        wallet_balance: (profile.wallet_balance ?? 0) - cost,
        sms_used: (profile.sms_used ?? 0) + recipients.length,
      })
      .eq("id", user.id);

    return json({
      success: true,
      sent: recipients.length,
      cost,
      campaign_id: campaign?.id,
    });
  } catch (err) {
    console.error("Edge function error:", err);
    return json({ error: err.message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
