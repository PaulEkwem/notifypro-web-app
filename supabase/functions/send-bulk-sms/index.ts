// @ts-nocheck
// NotifyPro — send-bulk-sms Edge Function (hardened)

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_PER_UNIT  = 6;      // ₦6 per SMS unit
const MAX_RECIPIENTS = 10_000;
const MAX_MSG_CHARS  = 1_600;  // ~10 concatenated SMS parts
const MAX_SENDER_LEN = 11;     // Telco max for alphanumeric sender IDs

// ── Simple in-memory rate limiter (per user, per cold-start instance) ──
// For production scale, replace with a Redis/Upstash-backed counter.
const rateLimitMap = new Map();
const RATE_LIMIT_MAX      = 10;  // max requests
const RATE_LIMIT_WINDOW   = 60_000; // per 60 seconds

function checkRateLimit(userId) {
  const now = Date.now();
  const entry = rateLimitMap.get(userId) || { count: 0, windowStart: now };

  if (now - entry.windowStart > RATE_LIMIT_WINDOW) {
    // Reset window
    entry.count      = 1;
    entry.windowStart = now;
    rateLimitMap.set(userId, entry);
    return true;
  }

  entry.count++;
  rateLimitMap.set(userId, entry);
  return entry.count <= RATE_LIMIT_MAX;
}

// ── Phone number validation (Nigerian + international E.164) ──
function isValidPhone(phone) {
  const clean = String(phone).replace(/\s+/g, '');
  return /^\d{11,15}$/.test(clean) || /^\+\d{11,15}$/.test(clean);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    // ── Validate Content-Type ──
    const ct = req.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      return json({ error: "Content-Type must be application/json" }, 415);
    }

    // ── Auth ──
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_ANON_KEY"),
      { global: { headers: { Authorization: req.headers.get("Authorization") } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    // ── Rate limiting ──
    if (!checkRateLimit(user.id)) {
      return json({ error: "Too many requests. Please wait before sending again." }, 429);
    }

    // ── Parse & validate body ──
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const { recipients, message, campaignName, senderId } = body;

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return json({ error: "recipients must be a non-empty array" }, 400);
    }
    if (recipients.length > MAX_RECIPIENTS) {
      return json({ error: `Max ${MAX_RECIPIENTS.toLocaleString()} recipients per campaign` }, 400);
    }
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return json({ error: "message is required" }, 400);
    }
    if (message.length > MAX_MSG_CHARS) {
      return json({ error: `Message too long. Max ${MAX_MSG_CHARS} characters.` }, 400);
    }
    if (senderId && (typeof senderId !== "string" || senderId.length > MAX_SENDER_LEN || !/^[a-zA-Z0-9 ]+$/.test(senderId))) {
      return json({ error: `Sender ID must be alphanumeric and max ${MAX_SENDER_LEN} characters` }, 400);
    }
    if (campaignName && typeof campaignName === "string" && campaignName.length > 255) {
      return json({ error: "Campaign name too long (max 255 chars)" }, 400);
    }

    // Validate each phone number
    const invalidNums = recipients.filter(r => !isValidPhone(r));
    if (invalidNums.length > 0) {
      return json({ error: `Invalid phone numbers detected: ${invalidNums.slice(0, 5).join(", ")}${invalidNums.length > 5 ? ` (+${invalidNums.length - 5} more)` : ""}` }, 400);
    }

    // ── Atomic wallet deduction via RPC (prevents double-spend) ──
    const admin = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    );

    const cost = recipients.length * RATE_PER_UNIT;

    const { data: deductResult, error: deductErr } = await admin.rpc("deduct_wallet_atomic", {
      p_user_id: user.id,
      p_amount:  cost,
    });

    if (deductErr) {
      console.error("Wallet deduction RPC error:", deductErr.message);
      return json({ error: "Could not process wallet deduction. Please try again." }, 500);
    }
    if (!deductResult.success) {
      return json({ error: deductResult.error }, 400);
    }

    const safeCampaignName = (campaignName || "Bulk SMS Campaign").slice(0, 255);

    // ── Call Termii in batches ──
    const TERMII_API_KEY = Deno.env.get("TERMII_API_KEY");
    if (!TERMII_API_KEY) {
      await admin.rpc("credit_wallet_atomic", { p_user_id: user.id, p_amount: cost });
      return json({ error: "SMS service not configured. Contact support." }, 503);
    }

    const from       = (senderId || Deno.env.get("TERMII_SENDER_ID") || "N-Alert").trim();
    const BATCH_SIZE = 100;
    let totalSent    = 0;
    let lastError    = "";
    const sentRecords = [];

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch  = recipients.slice(i, i + BATCH_SIZE);
      const isBulk = batch.length > 1;

      const termiiRes = await fetch(
        isBulk
          ? "https://api.ng.termii.com/api/sms/send/bulk"
          : "https://api.ng.termii.com/api/sms/send",
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            api_key: TERMII_API_KEY,
            to:      isBulk ? batch : batch[0],
            from,
            sms:     message,
            type:    "plain",
            channel: "generic",
          }),
        }
      );

      const termiiData = await termiiRes.json();

      if (!termiiRes.ok || termiiData.code === "error") {
        console.error("Termii batch error:", JSON.stringify(termiiData));
        lastError = termiiData.message || "Termii API error";
      } else {
        totalSent += batch.length;
        const ref = termiiData.message_id || termiiData.messageId || null;
        for (const r of batch) sentRecords.push({ recipient: r, provider_ref: ref });
      }
    }

    // If ALL batches failed, refund and return error
    if (totalSent === 0) {
      await admin.rpc("credit_wallet_atomic", { p_user_id: user.id, p_amount: cost });
      return json({ error: lastError || "All batches failed — check Termii API key and sender ID" }, 502);
    }

    // If only some batches failed, refund the unsent portion
    const actualCost = totalSent * RATE_PER_UNIT;
    const refundAmt  = cost - actualCost;
    if (refundAmt > 0) {
      await admin.rpc("credit_wallet_atomic", { p_user_id: user.id, p_amount: refundAmt });
    }

    // ── DB writes (background — non-blocking) ──
    (async () => {
      try {
        const now = new Date().toISOString();

        const { data: campaign, error: campErr } = await admin
          .from("campaigns")
          .insert({
            user_id:          user.id,
            name:             safeCampaignName,
            type:             "sms",
            status:           "sent",
            message:          message.trim(),
            sender_id:        senderId ? senderId.trim() : null,
            total_recipients: recipients.length,
            total_sent:       totalSent,
            total_delivered:  0,
            total_failed:     recipients.length - totalSent,
            cost:             actualCost,
            sent_at:          now,
            updated_at:       now,
          })
          .select()
          .single();

        if (campErr) console.error("Campaign insert error:", campErr.message);

        const { error: msgErr } = await admin.from("messages").insert(
          sentRecords.map((rec) => ({
            user_id:      user.id,
            campaign_id:  campaign?.id ?? null,
            type:         "sms",
            recipient:    rec.recipient,
            provider_ref: rec.provider_ref,
            status:       "sent",
            cost:         RATE_PER_UNIT,
            sent_at:      now,
          }))
        );
        if (msgErr) console.error("Messages insert error:", msgErr.message);

        // Increment sms_used (balance already deducted atomically above)
        const { data: prof } = await admin.from("profiles").select("sms_used").eq("id", user.id).single();
        if (prof) {
          await admin.from("profiles").update({ sms_used: (prof.sms_used ?? 0) + totalSent }).eq("id", user.id);
        }

      } catch (bgErr) {
        console.error("Background DB write error:", bgErr);
      }
    })();

    return json({ success: true, sent: totalSent, cost: actualCost });

  } catch (err) {
    console.error("Edge function error:", err);
    return json({ error: "An unexpected error occurred. Please try again." }, 500);
  }
});

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
