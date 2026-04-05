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

// ── SMS encoding & parts calculation ──
const GSM7_RE = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1BÆæßÉ !"#¤%&'()*+,\-.\/0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà]*$/;

function calcSmsParts(text) {
  const len = text.length;
  if (len === 0) return 1;
  const isGsm7 = GSM7_RE.test(text);
  if (isGsm7) return len <= 160 ? 1 : Math.ceil(len / 153);
  return len <= 70 ? 1 : Math.ceil(len / 67);
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

    const { recipients, message, messages: personalizedMessages, campaignName, senderId } = body;

    // Determine mode: personalised (per-contact messages) or bulk uniform
    const isPersonalised = Array.isArray(personalizedMessages) && personalizedMessages.length > 0;
    const isBulkUniform  = Array.isArray(recipients) && recipients.length > 0 &&
                           typeof message === "string" && message.trim().length > 0;

    if (!isPersonalised && !isBulkUniform) {
      return json({ error: "Provide either a 'messages' array (personalised) or 'recipients' + 'message' (bulk)" }, 400);
    }

    if (senderId && (typeof senderId !== "string" || senderId.length > MAX_SENDER_LEN || !/^[a-zA-Z0-9 ]+$/.test(senderId))) {
      return json({ error: `Sender ID must be alphanumeric and max ${MAX_SENDER_LEN} characters` }, 400);
    }
    if (campaignName && typeof campaignName === "string" && campaignName.length > 255) {
      return json({ error: "Campaign name too long (max 255 chars)" }, 400);
    }

    // ── Validate inputs based on mode ──
    let sendList: { to: string; message: string }[] = [];

    if (isPersonalised) {
      if (personalizedMessages.length > MAX_RECIPIENTS) {
        return json({ error: `Max ${MAX_RECIPIENTS.toLocaleString()} recipients per campaign` }, 400);
      }
      for (const item of personalizedMessages) {
        if (!item.to || !isValidPhone(item.to)) {
          return json({ error: `Invalid phone number: ${item.to}` }, 400);
        }
        if (!item.message || typeof item.message !== "string" || item.message.trim().length === 0) {
          return json({ error: `Empty message for recipient: ${item.to}` }, 400);
        }
        if (item.message.length > MAX_MSG_CHARS) {
          return json({ error: `Message too long for recipient ${item.to}. Max ${MAX_MSG_CHARS} characters.` }, 400);
        }
      }
      sendList = personalizedMessages.map(m => ({ to: String(m.to), message: String(m.message) }));
    } else {
      if (recipients.length > MAX_RECIPIENTS) {
        return json({ error: `Max ${MAX_RECIPIENTS.toLocaleString()} recipients per campaign` }, 400);
      }
      if (message.length > MAX_MSG_CHARS) {
        return json({ error: `Message too long. Max ${MAX_MSG_CHARS} characters.` }, 400);
      }
      const invalidNums = recipients.filter(r => !isValidPhone(r));
      if (invalidNums.length > 0) {
        return json({ error: `Invalid phone numbers detected: ${invalidNums.slice(0, 5).join(", ")}${invalidNums.length > 5 ? ` (+${invalidNums.length - 5} more)` : ""}` }, 400);
      }
      sendList = recipients.map(r => ({ to: r, message: message.trim() }));
    }

    // ── Atomic wallet deduction via RPC (prevents double-spend) ──
    const admin = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    );

    // Calculate cost based on SMS parts (₦6 per SMS unit)
    let totalUnits = 0;
    if (isPersonalised) {
      // Each personalised message may differ in length/parts
      for (const item of sendList) totalUnits += calcSmsParts(item.message);
    } else {
      // Bulk uniform — all messages identical
      const partsPerMsg = calcSmsParts(sendList[0].message);
      totalUnits = sendList.length * partsPerMsg;
    }
    const cost = totalUnits * RATE_PER_UNIT;

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

    const safeCampaignName = (campaignName || (isPersonalised ? "Personalised SMS Campaign" : "Bulk SMS Campaign")).slice(0, 255);

    // ── Call Termii ──
    const TERMII_API_KEY = Deno.env.get("TERMII_API_KEY");
    if (!TERMII_API_KEY) {
      await admin.rpc("credit_wallet_atomic", { p_user_id: user.id, p_amount: cost });
      return json({ error: "SMS service not configured. Contact support." }, 503);
    }

    const from = (senderId || Deno.env.get("TERMII_SENDER_ID") || "N-Alert").trim();
    let totalSent = 0;
    let lastError = "";
    const sentRecords: { recipient: string; provider_ref: string | null; parts: number }[] = [];

    if (isPersonalised) {
      // Send each personalised message individually (different text per contact)
      const CONCURRENCY = 20;
      for (let i = 0; i < sendList.length; i += CONCURRENCY) {
        const chunk = sendList.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          chunk.map(item =>
            fetch("https://api.ng.termii.com/api/sms/send", {
              method:  "POST",
              headers: { "Content-Type": "application/json" },
              body:    JSON.stringify({
                api_key: TERMII_API_KEY,
                to:      item.to,
                from,
                sms:     item.message,
                type:    "plain",
                channel: "generic",
              }),
            }).then(r => r.json().then(d => ({ ok: r.ok, data: d, to: item.to, message: item.message })))
          )
        );
        for (const res of results) {
          if (res.status === "fulfilled" && res.value.ok && res.value.data.code !== "error") {
            totalSent++;
            sentRecords.push({ recipient: res.value.to, provider_ref: res.value.data.message_id || res.value.data.messageId || null, parts: calcSmsParts(res.value.message) });
          } else {
            const errData = res.status === "fulfilled" ? res.value.data : {};
            console.error("Termii send error:", JSON.stringify(errData));
            lastError = errData.message || "Termii API error";
          }
        }
      }
    } else {
      // Bulk uniform — use batch endpoint for efficiency
      const BATCH_SIZE = 100;
      for (let i = 0; i < sendList.length; i += BATCH_SIZE) {
        const batch  = sendList.slice(i, i + BATCH_SIZE);
        const phones = batch.map(b => b.to);
        const isBulk = phones.length > 1;

        const termiiRes = await fetch(
          isBulk
            ? "https://api.ng.termii.com/api/sms/send/bulk"
            : "https://api.ng.termii.com/api/sms/send",
          {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({
              api_key: TERMII_API_KEY,
              to:      isBulk ? phones : phones[0],
              from,
              sms:     batch[0].message,
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
          const bulkParts = calcSmsParts(batch[0].message);
          for (const b of batch) sentRecords.push({ recipient: b.to, provider_ref: ref, parts: bulkParts });
        }
      }
    }

    // If ALL sends failed, refund and return error
    if (totalSent === 0) {
      await admin.rpc("credit_wallet_atomic", { p_user_id: user.id, p_amount: cost });
      return json({ error: lastError || "All sends failed — check Termii API key and sender ID" }, 502);
    }

    // If only some failed, refund the unsent portion
    let sentUnits = 0;
    for (const rec of sentRecords) {
      sentUnits += (rec.parts || 1);
    }
    const actualCost = sentUnits * RATE_PER_UNIT;
    const refundAmt  = cost - actualCost;
    if (refundAmt > 0) {
      await admin.rpc("credit_wallet_atomic", { p_user_id: user.id, p_amount: refundAmt });
    }

    // ── DB writes (background — non-blocking) ──
    (async () => {
      try {
        const now = new Date().toISOString();
        const templateMessage = isPersonalised ? "[Personalised]" : sendList[0].message;

        const { data: campaign, error: campErr } = await admin
          .from("campaigns")
          .insert({
            user_id:          user.id,
            name:             safeCampaignName,
            type:             "sms",
            status:           "sent",
            message:          templateMessage.trim(),
            sender_id:        senderId ? senderId.trim() : null,
            total_recipients: sendList.length,
            total_sent:       totalSent,
            total_delivered:  0,
            total_failed:     sendList.length - totalSent,
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
            cost:         rec.parts * RATE_PER_UNIT,
            sent_at:      now,
          }))
        );
        if (msgErr) console.error("Messages insert error:", msgErr.message);

        // Increment sms_used
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
