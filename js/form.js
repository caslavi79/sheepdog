/**
 * Sheepdog shared form functions
 * Used by index.html, events/index.html, staffing/index.html
 *
 * Requires: SUPABASE_URL to be defined before this script loads.
 */

// ── Contact form submission ─────────────────────────────────────────────────
async function submitForm(e) {
  e.preventDefault();
  var form = e.target;
  var btn = form.querySelector('.qf-submit');
  var orig = btn.textContent;
  // Validate phone if provided
  var phoneVal = form.elements['phone'].value.replace(/\D/g, '');
  if (phoneVal.length > 0 && phoneVal.length !== 10) {
    btn.textContent = 'Enter a valid 10-digit phone number';
    btn.style.background = '#C23B22';
    btn.style.color = '#FFF';
    setTimeout(function() { btn.textContent = orig; btn.style.background = ''; btn.style.color = ''; btn.disabled = false; }, 3000);
    return false;
  }

  btn.textContent = 'Sending...';
  btn.disabled = true;

  var data = {
    name:    form.elements['name'].value,
    phone:   form.elements['phone'].value,
    email:   form.elements['email'].value,
    service: form.elements['service'].value,
    message: form.elements['message'].value,
    confirm_email_hp: form.elements['confirm_email_hp'].value,
    company: form.elements['company'] ? form.elements['company'].value : ''
  };

  try {
    var res = await fetch(SUPABASE_URL + '/functions/v1/contact-submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    var result = await res.json();
    if (res.ok && result.success) {
      btn.textContent = "Sent! We'll be in touch.";
      btn.style.background = '#357A38';
      btn.style.color = '#FFF';
      btn.style.cursor = 'default';
      form.querySelectorAll('input, select, textarea').forEach(function(el) {
        el.disabled = true;
        el.style.opacity = '.5';
      });
    } else {
      throw new Error(result.error || 'Failed');
    }
  } catch (err) {
    btn.textContent = err.message || 'Something went wrong. Try again.';
    btn.style.background = '#C23B22';
    btn.style.color = '#FFF';
    btn.disabled = false;
    setTimeout(function() {
      btn.textContent = orig;
      btn.style.background = '';
      btn.style.color = '';
    }, 3000);
  }
  return false;
}

// ── Phone formatting ────────────────────────────────────────────────────────
function handlePhone(el) {
  var error = document.getElementById('phone-error');
  var digits = el.value.replace(/\D/g, '');
  el.value = formatPhone(digits);
  if (digits.length > 0 && digits.length !== 10) {
    error.textContent = 'Enter a 10-digit phone number';
    el.classList.add('qf-invalid');
  } else {
    error.textContent = '';
    el.classList.remove('qf-invalid');
  }
}

function formatPhone(d) {
  if (!d) return '';
  if (d.length <= 3) return '(' + d;
  if (d.length <= 6) return '(' + d.substring(0,3) + ') ' + d.substring(3);
  return '(' + d.substring(0,3) + ') ' + d.substring(3,6) + '-' + d.substring(6,10);
}

// ── Mobile nav ──────────────────────────────────────────────────────────────
function toggleMobileNav() {
  var burger = document.getElementById('burgerBtn');
  burger.classList.toggle('open');
  document.getElementById('mobileNav').classList.toggle('open');
  document.getElementById('mobileOverlay').classList.toggle('open');
  var isOpen = document.getElementById('mobileNav').classList.contains('open');
  burger.setAttribute('aria-expanded', isOpen);
  document.body.style.overflow = isOpen ? 'hidden' : '';
}

// ── FAQ accordion ───────────────────────────────────────────────────────────
function toggleFaq(btn) {
  var item = btn.closest('.faq-item') || btn.parentElement;
  var siblings = item.parentElement.querySelectorAll('.faq-item');
  siblings.forEach(function(s) {
    if (s !== item) {
      s.classList.remove('open');
      s.querySelector('.faq-q').setAttribute('aria-expanded', 'false');
    }
  });
  item.classList.toggle('open');
  btn.setAttribute('aria-expanded', item.classList.contains('open'));
}
