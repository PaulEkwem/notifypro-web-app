// NotifyPro — send-bulk-email Edge Function
// Sends bulk emails via Amazon SES v2, logs to DB, deducts wallet.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "npm:aws4fetch";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_PER_EMAIL = 0.50;  // ₦0.50 per email
const SES_REGION    = Deno.env.get("AWS_REGION") || "eu-west-1";
const SES_BASE      = `https://email.${SES_REGION}.amazonaws.com`;
const FROM_DEFAULT  = "NotifyPro <noreply@notifypro.ng>";
const BATCH_SIZE    = 50; // SES SendBulkEmail max per call

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    // ── Auth ──────────────────────────────────────────────────────
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    // ── Parse body ────────────────────────────────────────────────
    const { recipients, subject, htmlBody, textBody, campaignName, fromName } = await req.json();

    if (!Array.isArray(recipients) || recipients.length === 0 || !subject || !htmlBody) {
      return json({ error: "recipients (array), subject, and htmlBody are required" }, 400);
    }

    // ── Check wallet balance ──────────────────────────────────────
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("wallet_balance, email_used, email_limit")
      .eq("id", user.id)
      .single();

    if (profileErr || !profile) return json({ error: "Could not load user profile" }, 500);

    const estimatedCost = Math.ceil(recipients.length * RATE_PER_EMAIL * 100) / 100;
    if ((profile.wallet_balance ?? 0) < estimatedCost) {
      return json({
        error: `Insufficient balance. Need ₦${estimatedCost.toLocaleString()}, have ₦${(profile.wallet_balance ?? 0).toLocaleString()}.`,
      }, 400);
    }

    // ── AWS SES client ────────────────────────────────────────────
    const aws = new AwsClient({
      accessKeyId:     Deno.env.get("AWS_ACCESS_KEY_ID")!,
      secretAccessKey: Deno.env.get("AWS_SECRET_ACCESS_KEY")!,
      region:          SES_REGION,
      service:         "ses",
    });

    const fromAddress = fromName ? `${fromName} <noreply@notifypro.ng>` : FROM_DEFAULT;

    // ── Send in batches of 50 ─────────────────────────────────────
    let totalSent = 0;
    let totalFailed = 0;

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);

      const payload = {
        FromEmailAddress: fromAddress,
        DefaultContent: {
          Template: {
            TemplateContent: {
              Subject: subject,
              Html:    htmlBody,
              Text:    textBody || "",
            },
            TemplateData: "{}",
          },
        },
        BulkEmailEntries: batch.map((email: string) => ({
          Destination: { ToAddresses: [email] },
        })),
      };

      const res = await aws.fetch(`${SES_BASE}/v2/email/outbound-bulk-emails`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });

      if (res.ok) {
        totalSent += batch.length;
      } else {
        const err = await res.json().catch(() => ({}));
        console.error("SES batch error:", JSON.stringify(err));
        totalFailed += batch.length;
      }
    }

    if (totalSent === 0) {
      return json({ error: "All email sends failed. Check SES domain verification and sandbox status." }, 502);
    }

    // ── DB writes (admin client bypasses RLS) ─────────────────────
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const actualCost = Math.ceil(totalSent * RATE_PER_EMAIL * 100) / 100;

    const { data: campaign } = await admin.from("campaigns").insert({
      user_id:           user.id,
      name:              campaignName || "Email Campaign",
      type:              "email",
      status:            totalFailed === 0 ? "sent" : "partial",
      total_recipients:  recipients.length,
      total_delivered:   totalSent,
      cost:              actualCost,
      sent_at:           new Date().toISOString(),
    }).select().single();

    await admin.from("messages").insert(
      recipients.map((r: string) => ({
        user_id:     user.id,
        campaign_id: campaign?.id ?? null,
        type:        "email",
        recipient:   r,
        body:        subject,
        status:      "sent",
        cost:        RATE_PER_EMAIL,
      }))
    );

    await admin.from("profiles").update({
      wallet_balance: (profile.wallet_balance ?? 0) - actualCost,
      email_used:     (profile.email_used ?? 0) + totalSent,
    }).eq("id", user.id);

    return json({
      success:     true,
      sent:        totalSent,
      failed:      totalFailed,
      cost:        actualCost,
      campaign_id: campaign?.id,
    });

  } catch (err) {
    console.error("send-bulk-email error:", err.message, err.stack);
    return json({ error: err.message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
