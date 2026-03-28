/* ============================================
   NotifyPro — auth-guard.js
   - Redirects to login if not signed in
   - Populates sidebar with real user data
   - Handles logout
   Add to every dashboard page:
   <script type="module" src="../assets/js/auth-guard.js"></script>
============================================ */

import { supabase } from "./supabase-config.js";

// ── GUARD: redirect to login if not authenticated ─────────────
const { data: { session } } = await supabase.auth.getSession();
if (!session) window.location.href = "../login.html";

// ── POPULATE SIDEBAR with real user data ──────────────────────
if (session?.user) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, business_name, plan, wallet_balance, sms_used, sms_limit")
    .eq("id", session.user.id)
    .maybeSingle();

  if (profile) {
    const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || session.user.email;
    const initials = fullName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    const planLabel = { starter: "Starter Plan", business: "Business Plan", enterprise: "Enterprise Plan" };
    const smsUsed   = profile.sms_used   ?? 0;
    const smsLimit  = profile.sms_limit  ?? 5000;
    const smsPct    = smsLimit > 0 ? Math.min((smsUsed / smsLimit) * 100, 100).toFixed(1) : 0;
    const smsRemain = smsLimit > 0 ? smsLimit - smsUsed : "∞";
    const daysLeft  = 11; // TODO: calculate from billing cycle

    // Wait for sidebar to be injected by sidebar.js
    requestAnimationFrame(() => {
      const avatarEl = document.getElementById("userAvatar");
      if (avatarEl) avatarEl.textContent = initials;
      const nameEl = document.getElementById("userName");
      if (nameEl) nameEl.textContent = fullName;

      const planEl = document.querySelector(".user-plan");
      if (planEl) planEl.textContent = planLabel[profile.plan] || "Starter Plan";

      const balanceEl = document.getElementById("walletBalance");
      if (balanceEl) balanceEl.textContent = Number(profile.wallet_balance ?? 0).toLocaleString("en-NG");

      const estEl = document.getElementById("walletEst");
      if (estEl) estEl.textContent = `≈ ${Number(smsRemain).toLocaleString("en-NG")} SMS remaining`;

      const fillEl = document.getElementById("usageFill");
      if (fillEl) fillEl.style.width = smsPct + "%";

      const noteEl = document.querySelector(".usage-note");
      if (noteEl) noteEl.textContent = `${smsPct}% used · resets in ${daysLeft} days`;

      const topEl = document.querySelector(".usage-top strong");
      if (topEl) topEl.textContent = `${smsUsed.toLocaleString()} / ${smsLimit > 0 ? smsLimit.toLocaleString() : "∞"}`;
    });
  }
}

// ── LOGOUT ────────────────────────────────────────────────────
window.npLogout = async function () {
  await supabase.auth.signOut();
  window.location.href = "../login.html";
};
