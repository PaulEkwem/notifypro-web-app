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
        { id: 'bulk-sms',   label: 'Bulk SMS',        href: 'bulk-sms.html',   icon: iconSMS(),        badge: null },
        { id: 'email',      label: 'Email Campaigns', href: 'email.html',      icon: iconEmail(),      badge: null },
        { id: 'otp',        label: 'OTP & Verification', href: 'otp.html',      icon: iconLock(),       badge: null },
        { id: 'whatsapp',   label: 'WhatsApp',         href: 'whatsapp.html',   icon: iconWhatsApp(),   badge: 'Soon', badgeStyle: 'background:rgba(37,211,102,0.15);color:#25D366;border:1px solid rgba(37,211,102,0.3)' },
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
    <aside class="sidebar" id="sidebar">
      <a href="dashboard.html" class="sidebar-logo">Notify<span>Pro</span></a>
      <nav class="sidebar-nav" aria-label="Main navigation">
        ${buildNav()}
      </nav>
      <div class="sidebar-footer">
        <div class="wallet-chip">
          <div class="wallet-top">
            <span class="wallet-label">Wallet Balance</span>
            <a class="wallet-topup" href="#">+ Top Up</a>
          </div>
          <div class="wallet-amount">₦<em id="walletBalance">47,500</em></div>
          <div class="wallet-est" id="walletEst">≈ 11,875 SMS remaining</div>
        </div>
        <div class="usage-wrap">
          <div class="usage-top">
            <span>Monthly SMS Usage</span>
            <strong>18,400 / 30,000</strong>
          </div>
          <div class="usage-track">
            <div class="usage-fill" id="usageFill"></div>
          </div>
          <div class="usage-note">61.3% used · resets in 11 days</div>
        </div>
        <div class="user-card" id="userCard">
          <div class="user-avatar" id="userAvatar">EO</div>
          <div>
            <div class="user-name" id="userName">Emeka Okafor</div>
            <div class="user-plan">Business Plan</div>
          </div>
        </div>
        <button class="logout-btn" onclick="window.npLogout()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Log out
        </button>
      </div>
    </aside>`;

  // ── INJECT ──
  const layout = document.querySelector('.dash-layout');
  if (layout) {
    layout.insertAdjacentHTML('afterbegin', sidebarHTML);
  }

  // ── MOBILE TOGGLE ──
  document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    if (toggle && sidebar) {
      toggle.addEventListener('click', () => sidebar.classList.toggle('open'));
      // Close sidebar on outside click
      document.addEventListener('click', (e) => {
        if (!sidebar.contains(e.target) && !toggle.contains(e.target)) {
          sidebar.classList.remove('open');
        }
      });
    }

    // Animate usage bar
    setTimeout(() => {
      const fill = document.getElementById('usageFill');
      if (fill) fill.style.width = '61.3%';
    }, 500);
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
