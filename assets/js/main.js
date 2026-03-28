/* ============================================
   NotifyPro — main.js
   Structure:
   1. Scroll reveal animation
   2. Sticky nav shadow on scroll
   3. Smooth anchor scrolling
============================================ */

document.addEventListener("DOMContentLoaded", () => {
  // ── 1. SCROLL REVEAL ──
  // Adds the .visible class to .reveal elements when they enter the viewport
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
          // Stagger each element slightly for a cascade effect
          setTimeout(() => {
            entry.target.classList.add("visible");
          }, index * 80);
        }
      });
    },
    { threshold: 0.1 },
  );

  document.querySelectorAll(".reveal").forEach((el) => {
    revealObserver.observe(el);
  });

  // ── 2. NAV SCROLL SHADOW ──
  // Adds a subtle bottom border highlight when user scrolls past the hero
  const nav = document.querySelector("nav");

  const onScroll = () => {
    if (window.scrollY > 60) {
      nav.style.borderBottomColor = "rgba(255,255,255,0.12)";
    } else {
      nav.style.borderBottomColor = "rgba(255,255,255,0.07)";
    }
  };

  window.addEventListener("scroll", onScroll, { passive: true });

  // ── 3. SMOOTH ANCHOR SCROLLING ──
  // Handles clicks on nav links with offset for the fixed nav height
  const NAV_HEIGHT = 68;

  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", (e) => {
      const targetId = anchor.getAttribute("href");
      if (targetId === "#") return; // Skip empty anchors

      const targetEl = document.querySelector(targetId);
      if (!targetEl) return;

      e.preventDefault();

      const top =
        targetEl.getBoundingClientRect().top + window.scrollY - NAV_HEIGHT;
      window.scrollTo({ top, behavior: "smooth" });
    });
  });
});
