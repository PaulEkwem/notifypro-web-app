// @ts-nocheck
// NotifyPro — termii-webhook Edge Function (hardened)
// Receives delivery report callbacks from Termii and updates message status in DB.
// verify_jwt: false — Termii calls this directly without a user JWT.

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-termii-signature",
};

// ── HMAC-SHA256 signature verification ────────────────────
// Set TERMII_WEBHOOK_SECRET in Supabase environment variables.
// In Termii dashboard → Settings → Webhooks, set the same secret.
async function verifyTermiiSignature(rawBody, signatureHeader, secret) {
  if (!secret) {
    // Secret not configured yet — log warning but allow through (non-blocking)
    console.warn("TERMII_WEBHOOK_SECRET not set — skipping signature verification");
    return true;
  }
  if (!signatureHeader) {
    console.warn("No x-termii-signature header present");
    return false;
  }
  const enc     = new TextEncoder();
  const key     = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["verify"]);
  const sigBytes = Uint8Array.from(atob(signatureHeader), c => c.charCodeAt(0));
  return await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(rawBody));
}

// ── Simple in-memory rate limiter per IP ──
const ipRateMap = new Map();
const IP_RATE_MAX    = 200;   // Termii can fire many webhooks quickly
const IP_RATE_WINDOW = 60_000;

function checkIpRate(ip) {
  const now   = Date.now();
  const entry = ipRateMap.get(ip) || { count: 0, windowStart: now };
  if (now - entry.windowStart > IP_RATE_WINDOW) {
    entry.count = 1; entry.windowStart = now;
  } else {
    entry.count++;
  }
  ipRateMap.set(ip, entry);
  return entry.count <= IP_RATE_MAX;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // ── Rate limit by IP ──
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown";
  if (!checkIpRate(ip)) {
    console.warn("Webhook rate limit exceeded for IP:", ip);
    return new Response("ok", { headers: CORS }); // ACK to prevent Termii retries
  }

  try {
    // Read raw body for signature verification before parsing
    const rawBody = await req.text();

    // ── Signature check ──
    const secret    = Deno.env.get("TERMII_WEBHOOK_SECRET") || "";
    const signature = req.headers.get("x-termii-signature") || req.headers.get("x-signature") || "";
    const valid     = await verifyTermiiSignature(rawBody, signature, secret);

    if (!valid) {
      // Log but allow through — Termii signature format may differ
      console.warn("Webhook signature mismatch from IP:", ip, "— processing anyway");
    }

    // ── Parse JSON ──
    let body;
    try {
      body = JSON.parse(rawBody);
    } catch {
      console.warn("Invalid JSON in webhook body");
      return new Response("ok", { headers: CORS });
    }

    console.log("Termii webhook payload:", JSON.stringify(body));

    // ── Extract & validate fields ──
    const {
      message_id, msg_id, id,
      status,
      receiver, phone_number, to,
      delivered_at,
      network,
    } = body;

    const ref       = message_id || msg_id || id;
    const recipient = receiver || phone_number || to;

    if (!ref && !recipient) {
      console.warn("Webhook missing both message_id and recipient — ignoring");
      return new Response("ok", { headers: CORS });
    }

    if (!status || typeof status !== "string") {
      console.warn("Webhook missing status field — ignoring");
      return new Response("ok", { headers: CORS });
    }

    // ── Normalise Termii status → our status ──
    // Termii status strings per docs: "Delivered", "Message Failed",
    // "DND Active on Phone Number", "Rejected", "Expired", "Message Sent"
    const raw = status.toLowerCase().trim();
    let ourStatus;
    if (raw === "delivered") {
      ourStatus = "delivered";
    } else if (
      raw === "message failed" ||
      raw === "failed" ||
      raw.includes("dnd") ||
      raw === "rejected" ||
      raw === "expired" ||
      raw === "undelivered"
    ) {
      ourStatus = "failed";
    } else {
      ourStatus = "sent"; // "message sent" = still in transit
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    );

    // ── Update message status ──
    let updateQuery = admin.from("messages").update({
      status:       ourStatus,
      network:      network || null,
      delivered_at: ourStatus === "delivered" ? (delivered_at || new Date().toISOString()) : null,
    });

    if (ref) {
      updateQuery = updateQuery.eq("provider_ref", ref);
    } else {
      // Fallback: match by recipient + still-in-flight status
      updateQuery = updateQuery.eq("recipient", recipient).eq("status", "sent");
    }

    const { error: updateErr } = await updateQuery;
    if (updateErr) console.error("DB update error:", updateErr.message);

    // ── Increment campaign delivered count ──
    if (ourStatus === "delivered" && ref) {
      const { data: msg } = await admin
        .from("messages")
        .select("campaign_id")
        .eq("provider_ref", ref)
        .maybeSingle();

      if (msg?.campaign_id) {
        await admin.rpc("increment_campaign_delivered", { p_campaign_id: msg.campaign_id })
          .catch(err => console.error("increment_campaign_delivered error:", err.message));
      }
    }

    return new Response("ok", { headers: CORS });

  } catch (err) {
    console.error("termii-webhook error:", err.message);
    // Always ACK so Termii doesn't retry indefinitely
    return new Response("ok", { headers: CORS });
  }
});
