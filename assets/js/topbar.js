/* ============================================
   NotifyPro — topbar.js
   Injects the shared topbar into every dashboard page.

   Usage:
     window.NP_TITLE  = 'Email Campaigns';  // page title
     window.NP_ACTION = { label: '+ New Campaign', href: 'email.html' }; // optional CTA
============================================ */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    const title    = window.NP_TITLE  || 'Dashboard';
    const action   = window.NP_ACTION || null;

    const actionHTML = action
      ? `<a href="${action.href}" class="btn-primary">${action.label}</a>`
      : '';

    const topbarHTML = `
      <header class="topbar" id="topbar">
        <div class="topbar-left">
          <button class="menu-toggle" id="menuToggle" aria-label="Toggle sidebar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div class="topbar-title">${title}</div>
        </div>
        <div class="search-bar" role="search">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--muted);flex-shrink:0">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" placeholder="Search campaigns, logs…" aria-label="Search" id="globalSearch"/>
        </div>
        <div class="topbar-right">
          <button class="icon-btn" id="notifBtn" aria-label="Notifications">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            <span class="notif-dot"></span>
          </button>
          <button class="icon-btn" aria-label="Help">?</button>
          ${actionHTML}
        </div>
      </header>`;

    const main = document.querySelector('.main');
    if (main) {
      main.insertAdjacentHTML('afterbegin', topbarHTML);
    }
  });
})();
