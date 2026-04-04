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
    const _now = new Date();
    const _nextFirst = new Date(_now.getFullYear(), _now.getMonth() + 1, 1);
    const daysLeft = Math.ceil((_nextFirst - _now) / 86400000);

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

// ── SESSION TIMEOUT ───────────────────────────────────────────
(function () {
  const TIMEOUT_MS = 8 * 60 * 60 * 1000;  // 8 hours inactivity (matches JWT expiry)
  const WARNING_MS =     10 * 60 * 1000;  // warn 10 minutes before

  let timeoutId, warningId, warningEl;

  // Inject warning banner (hidden by default)
  const banner = document.createElement('div');
  banner.id = 'sessionWarning';
  banner.style.cssText = `
    display:none;position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    z-index:9999;background:#0D1117;border:1px solid rgba(255,184,0,0.4);
    border-radius:12px;padding:14px 20px;display:none;align-items:center;
    gap:16px;font-size:13px;color:#F0F4FF;box-shadow:0 8px 32px rgba(0,0,0,0.5);
    white-space:nowrap;
  `;
  banner.innerHTML = `
    <span>⏱ Session expiring in <strong id="sessionCountdown">2:00</strong> due to inactivity.</span>
    <button onclick="window._extendSession()" style="background:var(--accent,#00E87A);color:#000;border:none;border-radius:6px;padding:6px 14px;font-weight:700;font-size:12px;cursor:pointer;">Stay logged in</button>
    <button onclick="window.npLogout()" style="background:none;border:1px solid rgba(255,255,255,0.15);color:#8892A4;border-radius:6px;padding:6px 14px;font-size:12px;cursor:pointer;">Log out</button>
  `;
  document.body.appendChild(banner);
  warningEl = banner;

  let countdownInterval;

  function showWarning() {
    warningEl.style.display = 'flex';
    let secsLeft = WARNING_MS / 1000;
    const cd = document.getElementById('sessionCountdown');
    countdownInterval = setInterval(() => {
      secsLeft--;
      if (cd) {
        const m = Math.floor(secsLeft / 60);
        const s = String(secsLeft % 60).padStart(2, '0');
        cd.textContent = `${m}:${s}`;
      }
      if (secsLeft <= 0) clearInterval(countdownInterval);
    }, 1000);
  }

  function hideWarning() {
    warningEl.style.display = 'none';
    clearInterval(countdownInterval);
  }

  function resetTimer() {
    clearTimeout(timeoutId);
    clearTimeout(warningId);
    hideWarning();

    warningId = setTimeout(showWarning, TIMEOUT_MS - WARNING_MS);
    timeoutId = setTimeout(async () => {
      await supabase.auth.signOut();
      window.location.href = '../login.html';
    }, TIMEOUT_MS);
  }

  window._extendSession = resetTimer;

  // Reset on any user activity
  ['mousemove','mousedown','keydown','touchstart','scroll','click'].forEach(evt =>
    document.addEventListener(evt, resetTimer, { passive: true })
  );

  // Start the timer
  resetTimer();
})();
