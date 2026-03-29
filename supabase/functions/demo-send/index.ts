// NotifyPro — demo-send Edge Function
// Sends real demo messages (SMS / OTP) via Termii — no auth required.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TERMII_API_KEY = Deno.env.get("TERMII_API_KEY")!;
const TERMII_SENDER  = Deno.env.get("TERMII_SENDER_ID") || "N-Alert";

function normalizePhone(raw: string): string {
  let n = raw.replace(/\D/g, "");
  if (n.startsWith("0")) n = "234" + n.slice(1);
  if (!n.startsWith("234")) n = "234" + n;
  return n;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    const { action, channel, contact, pinId, pin } = body;

    console.log("demo-send called:", { action, channel, contact: contact?.slice(0,5) + "***" });

    // ── SMS: send a real demo message ──
    if (action === "send" && channel === "sms") {
      const phone = normalizePhone(contact);
      console.log("Sending SMS to:", phone);

      const res = await fetch("https://api.ng.termii.com/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key:  TERMII_API_KEY,
          to:       phone,
          from:     TERMII_SENDER,
          sms:      `Hello from NotifyPro! This is a live test SMS. You just experienced real-time delivery on Nigeria's fastest notification platform.`,
          type:     "plain",
          channel:  "dnd",
        }),
      });

      const data = await res.json();
      console.log("Termii SMS response:", JSON.stringify(data));

      if (!res.ok || data.code === "error") {
        return json({ error: data.message || "SMS send failed" }, 502);
      }
      return json({ success: true });
    }

    // ── OTP send: use Termii token endpoint ──
    if (action === "send" && channel === "otp") {
      const phone = normalizePhone(contact);
      console.log("Sending OTP to:", phone);

      const res = await fetch("https://api.ng.termii.com/api/sms/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key:          TERMII_API_KEY,
          message_type:     "NUMERIC",
          to:               phone,
          from:             TERMII_SENDER,
          channel:          "generic",
          pin_attempts:     3,
          pin_time_to_live: 5,
          pin_length:       6,
          pin_placeholder:  "< 1234 >",
          message_text:     "Your NotifyPro demo code is < 1234 >. Valid for 5 minutes.",
          pin_type:         "NUMERIC",
        }),
      });

      const data = await res.json();
      console.log("Termii OTP response:", JSON.stringify(data));

      if (!res.ok || !data.pinId) {
        return json({ error: data.message || "OTP send failed" }, 502);
      }
      return json({ success: true, pinId: data.pinId });
    }

    // ── OTP verify ──
    if (action === "verify" && channel === "otp") {
      console.log("Verifying OTP, pinId:", pinId);

      const res = await fetch("https://api.ng.termii.com/api/sms/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: TERMII_API_KEY,
          pin_id:  pinId,
          pin,
        }),
      });

      const data = await res.json();
      console.log("Termii verify response:", JSON.stringify(data));

      const verified = data.verified === true || data.msisdn !== undefined;
      return json({ success: verified, verified });
    }

    return json({ error: "Invalid action or channel" }, 400);
  } catch (err) {
    console.error("demo-send error:", err.message, err.stack);
    return json({ error: err.message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
