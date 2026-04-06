/* ============================================
   NotifyPro — sidebar.js
   Injects the shared sidebar into every dashboard page.
   Each page sets window.NP_PAGE to highlight the active nav item.

   Usage in each HTML page:
     <script>window.NP_PAGE = 'dashboard';</script>
     <script src="../js/sidebar.js"></script>
============================================ */

(function () {
  'use strict';

  // ── NAV STRUCTURE ──
  const NAV = [
    {
      section: 'Overview',
      items: [
        { id: 'dashboard',  label: 'Dashboard',       href: 'dashboard.html',  icon: iconDashboard(),  badge: null },
      ],
    },
    {
      section: 'Services',
      items: [
        { id: 'bulk-sms',   label: 'Bulk SMS',         href: 'bulk-sms.html',   icon: iconSMS(),        badge: null },
        { id: 'email',      label: 'Email',           href: 'email.html',      icon: iconEmail(),      badge: null },
        { id: 'otp',        label: 'Security & Verify', href: 'otp.html',      icon: iconLock(),       badge: null },
      ],
    },
    {
      section: 'Analytics',
      items: [
        { id: 'reports',    label: 'Reports',         href: 'reports.html',    icon: iconBar(),        badge: null },
        { id: 'logs',       label: 'Delivery Logs',   href: 'logs.html',       icon: iconClock(),      badge: null },
      ],
    },
    {
      section: 'Account',
      items: [
        { id: 'contacts',   label: 'Contacts',        href: 'contacts.html',   icon: iconUser(),       badge: null },
        { id: 'api-keys',   label: 'API Keys',        href: 'api-keys.html',   icon: iconCode(),       badge: null },
        { id: 'settings',   label: 'Settings',        href: 'settings.html',   icon: iconSettings(),   badge: null },
      ],
    },
  ];

  const activePage = window.NP_PAGE || '';

  // ── BUILD SIDEBAR HTML ──
  function buildNavItems(items) {
    return items.map(item => {
      const isActive = item.id === activePage;
      const badge    = item.badge
        ? `<span class="nav-badge" style="${item.badgeStyle || ''}">${item.badge}</span>`
        : '';
      return `
        <a class="nav-item${isActive ? ' active' : ''}" href="${item.href}">
          <span class="nav-icon">${item.icon}</span>
          ${item.label}
          ${badge}
        </a>`;
    }).join('');
  }

  function buildNav() {
    return NAV.map(group => `
      <span class="nav-section-label">${group.section}</span>
      ${buildNavItems(group.items)}
    `).join('');
  }

  const sidebarHTML = `
    <div id="sidebarBackdrop" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:49;backdrop-filter:blur(2px)"></div>
    <aside class="sidebar" id="sidebar">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:0 1.5rem;height:64px;border-bottom:1px solid rgba(255,255,255,0.07);flex-shrink:0">
        <a href="dashboard.html" class="sidebar-logo" style="border:none;padding:0;height:auto">Notify<span>Pro</span></a>
        <button id="sidebarClose" style="display:none;background:none;border:none;color:#8892A4;cursor:pointer;padding:4px;line-height:1" aria-label="Close menu">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <nav class="sidebar-nav" aria-label="Main navigation">
        ${buildNav()}
      </nav>
      <div class="sidebar-footer">
        <div class="wallet-chip">
          <div class="wallet-top">
            <span class="wallet-label">Wallet Balance</span>
            <a class="wallet-topup" href="#">+ Top Up</a>
          </div>
          <div class="wallet-amount">₦<em id="walletBalance">—</em></div>
        </div>
        <div class="user-card" id="userCard">
          <div class="user-avatar" id="userAvatar">–</div>
          <div>
            <div class="user-name" id="userName">Loading…</div>
          </div>
        </div>
        <button class="logout-btn" onclick="window.npLogout()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Log out
        </button>
      </div>
    </aside>`;

  // ── TOP-UP MODAL HTML ──
  const topupModalHTML = `
  <div id="npTopupOverlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:999;backdrop-filter:blur(4px);align-items:center;justify-content:center">
    <div style="background:#0D1117;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:2rem;width:90%;max-width:400px;position:relative">
      <button onclick="window.closeTopUp()" style="position:absolute;top:14px;right:16px;background:none;border:none;color:#8892A4;font-size:20px;cursor:pointer;line-height:1">×</button>
      <h3 style="font-family:'Syne',sans-serif;font-size:18px;font-weight:800;margin:0 0 4px">Top Up Wallet</h3>
      <p style="font-size:13px;color:#8892A4;margin:0 0 1.25rem">Funds are added to your balance instantly.</p>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:1rem" id="npTopupPresets">
        <button onclick="npSetPreset(5000)"  data-amt="5000"  class="np-preset">₦5,000</button>
        <button onclick="npSetPreset(10000)" data-amt="10000" class="np-preset">₦10,000</button>
        <button onclick="npSetPreset(25000)" data-amt="25000" class="np-preset">₦25,000</button>
        <button onclick="npSetPreset(50000)" data-amt="50000" class="np-preset">₦50,000</button>
      </div>

      <label style="font-size:12px;color:#8892A4;display:block;margin-bottom:6px">Or enter amount (₦)</label>
      <input type="number" id="npTopupAmt" placeholder="e.g. 3000" min="1000"
        style="width:100%;background:#161B22;border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:10px 14px;color:#F0F4FF;font-size:14px;outline:none;box-sizing:border-box;margin-bottom:1rem"
        oninput="npOnAmtInput()" />

      <div id="npTopupBreakdown" style="display:none;background:#161B22;border-radius:8px;padding:12px;margin-bottom:1rem;font-size:13px">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="color:#8892A4">Wallet credit</span><span id="npBkCredit" style="font-weight:600;color:#F0F4FF">—</span></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="color:#8892A4">VAT (7.5%)</span><span id="npBkVat" style="font-weight:600;color:#F0F4FF">—</span></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:10px"><span style="color:#8892A4">Processing fee (1.5%)</span><span id="npBkFee" style="font-weight:600;color:#F0F4FF">—</span></div>
        <div style="display:flex;justify-content:space-between;border-top:1px solid rgba(255,255,255,0.06);padding-top:10px"><span style="font-weight:700;color:#F0F4FF">Total charged</span><span id="npBkTotal" style="font-weight:700;color:#FFB800">—</span></div>
      </div>

      <button id="npTopupPayBtn" onclick="npInitiateTopup()"
        style="width:100%;background:#00E87A;color:#000;border:none;border-radius:10px;padding:13px;font-size:14px;font-weight:700;cursor:pointer;font-family:'Syne',sans-serif;opacity:0.4;pointer-events:none">
        Continue →
      </button>
      <div id="npTopupErr" style="color:#FF4D6D;font-size:12px;margin-top:8px;text-align:center;display:none"></div>
    </div>
  </div>

  <style>
    .np-preset{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#F0F4FF;font-size:13px;font-weight:600;padding:7px 14px;cursor:pointer;transition:border-color .2s}
    .np-preset:hover{border-color:rgba(0,232,122,0.4)}
    .np-preset.active{border-color:#00E87A;background:rgba(0,232,122,0.08);color:#00E87A}
  </style>`;

  document.body.insertAdjacentHTML('beforeend', topupModalHTML);

  // ── TOP-UP MODAL LOGIC ──
  let _npTopupAmt = 0;

  window.openTopUp = function () {
    _npTopupAmt = 0;
    document.getElementById('npTopupAmt').value = '';
    document.getElementById('npTopupBreakdown').style.display = 'none';
    document.querySelectorAll('.np-preset').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById('npTopupPayBtn');
    btn.style.opacity = '0.4'; btn.style.pointerEvents = 'none';
    document.getElementById('npTopupErr').style.display = 'none';
    const overlay = document.getElementById('npTopupOverlay');
    overlay.style.display = 'flex';
  };

  window.closeTopUp = function () {
    document.getElementById('npTopupOverlay').style.display = 'none';
  };

  document.getElementById('npTopupOverlay').addEventListener('click', function (e) {
    if (e.target === this) window.closeTopUp();
  });

  window.npSetPreset = function (amt) {
    _npTopupAmt = amt;
    document.getElementById('npTopupAmt').value = amt;
    document.querySelectorAll('.np-preset').forEach(b => b.classList.toggle('active', Number(b.dataset.amt) === amt));
    npUpdateBreakdown();
  };

  window.npOnAmtInput = function () {
    _npTopupAmt = Number(document.getElementById('npTopupAmt').value);
    document.querySelectorAll('.np-preset').forEach(b => b.classList.remove('active'));
    npUpdateBreakdown();
  };

  function npUpdateBreakdown() {
    const amt = _npTopupAmt;
    const btn = document.getElementById('npTopupPayBtn');
    const bd  = document.getElementById('npTopupBreakdown');
    if (!amt || amt < 1000) {
      bd.style.display = 'none';
      btn.style.opacity = '0.4'; btn.style.pointerEvents = 'none';
      return;
    }
    const vat   = Math.round(amt * 0.075);
    const fee   = Math.min(Math.round(amt * 0.015), 2000);
    const total = amt + vat + fee;
    document.getElementById('npBkCredit').textContent = '₦' + amt.toLocaleString('en-NG');
    document.getElementById('npBkVat').textContent    = '₦' + vat.toLocaleString('en-NG');
    document.getElementById('npBkFee').textContent    = '₦' + fee.toLocaleString('en-NG');
    document.getElementById('npBkTotal').textContent  = '₦' + total.toLocaleString('en-NG');
    bd.style.display = 'block';
    btn.style.opacity = '1'; btn.style.pointerEvents = 'auto';
    btn.textContent = 'Pay ₦' + total.toLocaleString('en-NG') + ' →';
  }

  window.npInitiateTopup = async function () {
    const amt = _npTopupAmt;
    if (!amt || amt < 1000) return;

    const errEl = document.getElementById('npTopupErr');
    errEl.style.display = 'none';

    if (typeof MonnifySDK === 'undefined') {
      errEl.textContent   = 'Payment SDK not loaded. Please refresh and try again.';
      errEl.style.display = 'block';
      return;
    }

    // Wait up to 3s for the page's module script to set window._supabase
    let sb = window._supabase;
    if (!sb) {
      await new Promise(resolve => {
        let tries = 0;
        const poll = setInterval(() => {
          if (window._supabase || ++tries > 30) { clearInterval(poll); resolve(); }
        }, 100);
      });
      sb = window._supabase;
    }
    if (!sb) { errEl.textContent = 'Not authenticated.'; errEl.style.display = 'block'; return; }

    const { data: { session } } = await sb.auth.getSession();
    if (!session) { window.location.href = '../login.html'; return; }

    const vat   = Math.round(amt * 0.075);
    const fee   = Math.min(Math.round(amt * 0.015), 2000);
    const total = amt + vat + fee;

    const btn      = document.getElementById('npTopupPayBtn');
    const fullName = session.user.user_metadata?.first_name
      ? (session.user.user_metadata.first_name + ' ' + (session.user.user_metadata.last_name || '')).trim()
      : session.user.email;

    MonnifySDK.initialize({
      apiKey:             'MK_TEST_S9X5EPVQ0Q',
      contractCode:       '4599283456',
      amount:             total,
      currency:           'NGN',
      reference:          'NFYPRO-' + Date.now() + '-' + Math.random().toString(36).slice(2,7).toUpperCase(),
      customerFullName:   fullName,
      customerEmail:      session.user.email,
      paymentDescription: 'NotifyPro Wallet Top-Up',
      isTestMode:         true,
      paymentMethods:     ['CARD', 'ACCOUNT_TRANSFER'],
      onLoadStart:        () => {},
      onLoadComplete:     () => {},
      onComplete: function (response) {
        if (response.paymentStatus !== 'PAID') return;
        btn.textContent = 'Verifying payment…';
        btn.style.pointerEvents = 'none';
        (async () => {
          try {
            const { data: { session: sess } } = await sb.auth.getSession();
            const res = await fetch(
              'https://oilnrhqcfzkonoumsfav.supabase.co/functions/v1/verify-payment',
              {
                method:  'POST',
                headers: {
                  'Content-Type':  'application/json',
                  'Authorization': 'Bearer ' + sess.access_token,
                },
                body: JSON.stringify({
                  paymentReference: response.paymentReference,
                  creditAmount:     amt,
                }),
              }
            );
            const result = await res.json();
            if (!res.ok || !result.success) {
              errEl.textContent   = result.error || 'Payment received but balance update failed. Contact support.';
              errEl.style.display = 'block';
              btn.textContent = 'Pay ₦' + total.toLocaleString('en-NG') + ' →';
              btn.style.pointerEvents = 'auto';
              return;
            }
            // Update balance in sidebar live
            const balEl = document.getElementById('walletBalance');
            if (balEl) balEl.textContent = Number(result.new_balance).toLocaleString('en-NG');
            window.closeTopUp();
          } catch (e) {
            errEl.textContent   = 'Network error. Contact support with your payment reference.';
            errEl.style.display = 'block';
            btn.textContent = 'Pay ₦' + total.toLocaleString('en-NG') + ' →';
            btn.style.pointerEvents = 'auto';
          }
        })();
      },
      onClose: function () {
        btn.textContent = 'Pay ₦' + total.toLocaleString('en-NG') + ' →';
        btn.style.pointerEvents = 'auto';
      },
    });
  };

  // ── INJECT ──
  const layout = document.querySelector('.dash-layout');
  if (layout) {
    layout.insertAdjacentHTML('afterbegin', sidebarHTML);
  }

  // ── MOBILE TOGGLE ──
  function isMobile() { return window.innerWidth <= 768; }

  function openSidebar() {
    const sidebar  = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    const closeBtn = document.getElementById('sidebarClose');
    if (!sidebar) return;
    sidebar.classList.add('open');
    if (backdrop) { backdrop.style.display = 'block'; }
    if (closeBtn) { closeBtn.style.display = 'flex'; }
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    const sidebar  = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    const closeBtn = document.getElementById('sidebarClose');
    if (!sidebar) return;
    sidebar.classList.remove('open');
    if (backdrop) { backdrop.style.display = 'none'; }
    if (closeBtn) { closeBtn.style.display = 'none'; }
    document.body.style.overflow = '';
  }

  // Wire up toggle — use capturing so page-level handlers don't double-fire
  document.addEventListener('DOMContentLoaded', () => {
    const toggle   = document.getElementById('menuToggle');
    const backdrop = document.getElementById('sidebarBackdrop');
    const closeBtn = document.getElementById('sidebarClose');

    if (toggle) {
      // Remove any duplicate listener pages may have added by replacing the element
      const newToggle = toggle.cloneNode(true);
      toggle.parentNode.replaceChild(newToggle, toggle);
      newToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const sidebar = document.getElementById('sidebar');
        if (sidebar.classList.contains('open')) { closeSidebar(); } else { openSidebar(); }
      });
    }

    if (backdrop) backdrop.addEventListener('click', closeSidebar);
    if (closeBtn) closeBtn.addEventListener('click', closeSidebar);

    // Wire Top Up link to shared modal
    const topUpLink = document.querySelector('.wallet-topup');
    if (topUpLink) {
      topUpLink.addEventListener('click', (e) => {
        e.preventDefault();
        closeSidebar();
        window.openTopUp();
      });
    }

    // Close sidebar when a nav link is tapped on mobile
    document.querySelectorAll('.sidebar .nav-item').forEach(link => {
      link.addEventListener('click', () => { if (isMobile()) closeSidebar(); });
    });

    // Show ✕ button only on mobile via CSS-equivalent
    function checkMobile() {
      const closeBtn = document.getElementById('sidebarClose');
      if (closeBtn) closeBtn.style.display = isMobile() ? 'flex' : 'none';
      // Reset close button — only show when sidebar is open
      const sidebar = document.getElementById('sidebar');
      if (sidebar && !sidebar.classList.contains('open')) {
        if (closeBtn) closeBtn.style.display = 'none';
      }
    }
    window.addEventListener('resize', () => { if (!isMobile()) closeSidebar(); });
    checkMobile();
  });

  // ── SVG ICONS ──
  function iconDashboard() {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`;
  }
  function iconSMS() {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
  }
  function iconEmail() {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`;
  }
  function iconLock() {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
  }
  function iconBar() {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`;
  }
  function iconClock() {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
  }
  function iconUser() {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
  }
  function iconCode() {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;
  }
  function iconSettings() {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>`;
  }
  function iconWhatsApp() {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;
  }
})();
