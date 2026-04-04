/* ============================================
   NotifyPro — signup.js
   OTP via EmailJS · Account creation via Supabase
============================================ */

import { supabase } from "./supabase-config.js";

// ── EMAILJS CONFIG ────────────────────────────────────────────
const EJS_SERVICE  = 'service_vancprr';
const EJS_TEMPLATE = 'template_6zwhom1';
const EJS_KEY      = 'QK8T4uVIZyC-K8OsU';
emailjs.init(EJS_KEY);

// ── STATE ─────────────────────────────────────────────────────
let currentStep  = 1;
const totalSteps = 4;
let timerInterval;
let generatedOtp = '';

const PLAN_LIMITS = { starter: 5000, business: 30000, enterprise: -1 };

// ── STEP NAVIGATION ───────────────────────────────────────────
window.goStep = async function (n) {
  if (n > currentStep && !validateStep(currentStep)) return;

  // Check for duplicate email when leaving step 1
  if (n === 2 && currentStep === 1) {
    const email   = document.getElementById('email').value.trim();
    const contBtn = document.querySelector('#step-1 .btn-primary');
    const origTxt = contBtn.textContent;
    contBtn.disabled    = true;
    contBtn.textContent = 'Checking…';

    const { data: exists, error } = await supabase.rpc('email_exists', { check_email: email });

    contBtn.disabled    = false;
    contBtn.textContent = origTxt;

    if (error) console.error('Email check error:', error);

    if (exists) {
      const emailEl  = document.getElementById('email');
      const emailErr = document.getElementById('err-email');
      emailEl.classList.add('error');
      emailErr.textContent = 'An account with this email already exists.';
      emailErr.classList.add('show');
      return;
    }
  }

  if (n === 4) {
    const email = document.getElementById('email').value.trim();
    document.getElementById('verify-email-display').textContent = email;
    await sendOtpEmail();
  }

  document.getElementById('step-' + currentStep).classList.remove('active');
  document.getElementById('step-' + n).classList.add('active');
  currentStep = n;
  updateProgress();
};

function updateProgress() {
  document.getElementById('progress-fill').style.width =
    (currentStep / totalSteps) * 100 + '%';

  for (let i = 1; i <= totalSteps; i++) {
    const lbl = document.getElementById('lbl-' + i);
    if (!lbl) continue;
    lbl.classList.remove('active', 'done');
    if (i === currentStep)      lbl.classList.add('active');
    else if (i < currentStep)   lbl.classList.add('done');
  }
}

// ── EMAILJS: SEND OTP ─────────────────────────────────────────
window.sendOtpEmail = async function () {
  const btn       = document.getElementById('verify-send-btn');
  const email     = document.getElementById('email').value.trim();
  const firstName = document.getElementById('firstName').value.trim();

  btn.disabled    = true;
  btn.textContent = 'Sending…';
  generatedOtp    = Math.floor(100000 + Math.random() * 900000).toString();

  try {
    await emailjs.send(EJS_SERVICE, EJS_TEMPLATE, {
      email,
      to_name:  firstName,
      otp_code: generatedOtp,
    });

    btn.textContent      = 'Code Sent ✓';
    btn.style.background = 'rgba(0,232,122,0.15)';
    btn.style.color      = 'var(--accent)';
    btn.style.border     = '1px solid rgba(0,232,122,0.3)';
    startResendTimer();
  } catch (err) {
    btn.disabled    = false;
    btn.textContent = 'Retry Send';
    console.error(err);
    showOtpBanner('Could not send code. Please check your connection and try again.', 'error');
  }
};

// ── VERIFY OTP → CREATE SUPABASE ACCOUNT ─────────────────────
window.verifyOtp = async function () {
  const code = ['otp1','otp2','otp3','otp4','otp5','otp6']
    .map(id => document.getElementById(id).value)
    .join('');

  if (code.length < 6)      { flashOtpError(); return; }
  if (code !== generatedOtp) {
    flashOtpError();
    showOtpBanner('Incorrect code. Please try again.', 'error');
    return;
  }

  // ✅ OTP correct — now create the Supabase account
  const verifyBtn = document.querySelector('#step-4 .btn-row .btn-primary');
  verifyBtn.textContent = 'Creating account…';
  verifyBtn.disabled    = true;

  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const plan     = getSelectedPlan();
  const services = getSelectedServices();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name:    document.getElementById('firstName').value.trim(),
        last_name:     document.getElementById('lastName').value.trim(),
        business_name: document.getElementById('bizName').value.trim(),
        phone:         document.getElementById('phone').value.trim(),
        industry:      document.getElementById('industry').value,
        use_case:      document.getElementById('useCase').value,
        plan,
        services,
      },
    },
  });

  if (error) {
    showOtpBanner('Account error: ' + error.message, 'error');
    verifyBtn.textContent = 'Verify & Finish →';
    verifyBtn.disabled    = false;
    return;
  }

  // Update profile with full details
  if (data.user) {
    await supabase.from('profiles').update({
      first_name:    document.getElementById('firstName').value.trim(),
      last_name:     document.getElementById('lastName').value.trim(),
      business_name: document.getElementById('bizName').value.trim(),
      phone:         document.getElementById('phone').value.trim(),
      industry:      document.getElementById('industry').value,
      use_case:      document.getElementById('useCase').value,
      plan,
      sms_limit:     PLAN_LIMITS[plan] ?? 5000,
    }).eq('id', data.user.id);
  }

  // ── Show success screen ──────────────────────────────────────
  document.getElementById('step-4').classList.remove('active');
  document.getElementById('step-5').classList.add('active');
  document.getElementById('progress-fill').style.width = '100%';
  ['lbl-1','lbl-2','lbl-3','lbl-4'].forEach(id => {
    const el = document.getElementById(id);
    el.classList.remove('active');
    el.classList.add('done');
  });

  // If user came from send.html, return there to complete the send
  const urlParams  = new URLSearchParams(window.location.search);
  const ref        = urlParams.get('ref');
  const hasPending = sessionStorage.getItem('np_sms_msg') && sessionStorage.getItem('np_sms_contacts');

  if (ref === 'sms' && hasPending) {
    const note = document.querySelector('#step-5 p');
    if (note) note.textContent = 'Account created! Taking you back to finish sending your message…';
    setTimeout(() => { window.location.href = 'send.html?resume=1'; }, 2000);
  } else {
    setTimeout(() => { window.location.href = 'pages/dashboard.html'; }, 2000);
  }
};

// ── RESEND ────────────────────────────────────────────────────
window.resendCode = function () {
  const btn            = document.getElementById('verify-send-btn');
  btn.disabled         = false;
  btn.textContent      = 'Send Code →';
  btn.style.background = '';
  btn.style.color      = '';
  btn.style.border     = '';
  window.sendOtpEmail();
};

// ── VALIDATION ────────────────────────────────────────────────
function validateStep(step) {
  if (step !== 1) return true;
  let ok = true;
  const fields = [
    { id: 'firstName', err: 'err-firstName', check: v => v.trim().length > 0 },
    { id: 'lastName',  err: 'err-lastName',  check: v => v.trim().length > 0 },
    { id: 'bizName',   err: 'err-bizName',   check: v => v.trim().length > 0 },
    { id: 'email',     err: 'err-email',     check: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) },
    { id: 'phone',     err: 'err-phone',     check: v => v.replace(/\D/g,'').length >= 10 },
    { id: 'password',  err: 'err-password',  check: v => v.length >= 8 },
  ];
  fields.forEach(({ id, err, check }) => {
    const el    = document.getElementById(id);
    const errEl = document.getElementById(err);
    if (!check(el.value)) {
      el.classList.add('error'); errEl.classList.add('show'); ok = false;
    } else {
      el.classList.remove('error'); errEl.classList.remove('show');
    }
  });
  return ok;
}

['firstName','lastName','bizName','email','phone','password'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', () => {
    document.getElementById(id).classList.remove('error');
    document.getElementById('err-' + id)?.classList.remove('show');
  });
});

// ── PASSWORD TOGGLE & STRENGTH ────────────────────────────────
window.togglePw = function () {
  const inp = document.getElementById('password');
  inp.type  = inp.type === 'password' ? 'text' : 'password';
};

document.getElementById('password')?.addEventListener('input', function () {
  const v = this.value;
  const fill  = document.getElementById('pw-fill');
  const label = document.getElementById('pw-label');
  let strength = 0;
  if (v.length >= 8)           strength++;
  if (/[A-Z]/.test(v))         strength++;
  if (/[0-9]/.test(v))         strength++;
  if (/[^A-Za-z0-9]/.test(v))  strength++;
  const colors = ['','#FF4D6D','#FFB800','#00BFFF','#00E87A'];
  const labels = ['','Weak','Fair','Good','Strong'];
  fill.style.width      = (strength / 4 * 100) + '%';
  fill.style.background = colors[strength] || '';
  label.textContent     = v.length ? labels[strength] : '';
  label.style.color     = colors[strength] || '';
});


// ── PLAN SELECT ───────────────────────────────────────────────
window.selectPlan = function (plan) {
  ['starter','business','enterprise'].forEach(p =>
    document.getElementById('plan-' + p).classList.remove('selected')
  );
  document.getElementById('plan-' + plan).classList.add('selected');
};

function getSelectedPlan() {
  return document.querySelector('.plan-card.selected input[type="radio"]')?.value || 'starter';
}

// ── SERVICE TOGGLE ────────────────────────────────────────────
['sms','email','otp','2fa'].forEach(svc => {
  document.getElementById('svc-' + svc)?.addEventListener('click', () => {
    const card = document.getElementById('svc-' + svc);
    card.classList.toggle('selected');
    card.querySelector('.service-check').textContent =
      card.classList.contains('selected') ? '✓' : '';
  });
});

function getSelectedServices() {
  return ['sms','email','otp','2fa'].filter(svc =>
    document.getElementById('svc-' + svc)?.classList.contains('selected')
  );
}

// ── OTP INPUT NAVIGATION ──────────────────────────────────────
window.otpPaste = function (e) {
  e.preventDefault();
  const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
  ['otp1','otp2','otp3','otp4','otp5','otp6'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.value = digits[i] || '';
  });
  const last = document.getElementById('otp' + Math.min(digits.length, 6));
  if (last) last.focus();
};
window.otpNext = function (el, nextId) {
  el.value = el.value.replace(/[^0-9]/g, '');
  if (el.value && nextId) document.getElementById(nextId).focus();
};
window.otpBack = function (e, el, prevId) {
  if (e.key === 'Backspace' && !el.value && prevId)
    document.getElementById(prevId).focus();
};

// ── RESEND TIMER ──────────────────────────────────────────────
function startResendTimer() {
  clearInterval(timerInterval);
  let secs = 60;
  const timerEl = document.getElementById('resend-timer');
  timerEl.textContent = '(' + secs + 's)';
  timerInterval = setInterval(() => {
    secs--;
    timerEl.textContent = secs > 0 ? '(' + secs + 's)' : '';
    if (secs <= 0) clearInterval(timerInterval);
  }, 1000);
}

// ── OTP ERROR HELPERS ─────────────────────────────────────────
function flashOtpError() {
  document.querySelectorAll('.otp-input').forEach(i => {
    i.style.borderColor = 'rgba(255,77,109,0.5)';
    setTimeout(() => (i.style.borderColor = ''), 1500);
  });
}

function showOtpBanner(msg, type) {
  document.getElementById('otp-banner')?.remove();
  const color  = type === 'error' ? 'var(--error)'              : 'var(--accent)';
  const bg     = type === 'error' ? 'rgba(255,77,109,0.07)'     : 'rgba(0,232,122,0.07)';
  const border = type === 'error' ? 'rgba(255,77,109,0.2)'      : 'rgba(0,232,122,0.2)';
  const el     = document.createElement('p');
  el.id        = 'otp-banner';
  el.style.cssText = `color:${color};background:${bg};border:1px solid ${border};
    border-radius:6px;font-size:13px;text-align:center;padding:10px 14px;margin-top:12px;`;
  el.textContent = msg;
  document.querySelector('.resend').insertAdjacentElement('afterend', el);
  setTimeout(() => el.remove(), 5000);
}
