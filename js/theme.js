/* ===========================================================
   Easy English — Theme (dark mode) + mobile hamburger nav
   Shared across all pages. Applies dark-mode class to <html>
   as early as possible (before paint) via the inline snippet
   in each page's <head>; this file wires up the toggle buttons
   and the hamburger menu once the DOM is ready.
   =========================================================== */

const SUN_ICON = `<svg class="icon-sun" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const MOON_ICON = `<svg class="icon-moon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" fill="currentColor"/></svg>`;

function applyStoredTheme() {
  const saved = localStorage.getItem('ee-theme');
  const isDark = saved === 'dark';
  document.documentElement.classList.toggle('dark-mode', isDark);
  return isDark;
}

function setTheme(isDark) {
  document.documentElement.classList.toggle('dark-mode', isDark);
  localStorage.setItem('ee-theme', isDark ? 'dark' : 'light');
  // Keep every toggle switch on the page in sync (desktop nav + mobile menu)
  document.querySelectorAll('.theme-toggle').forEach(btn => {
    btn.setAttribute('aria-checked', String(isDark));
  });
}

function toggleTheme() {
  const isDark = !document.documentElement.classList.contains('dark-mode');
  setTheme(isDark);
}

// Builds a toggle switch button and wires its click handler
function buildThemeToggle() {
  const btn = document.createElement('button');
  btn.className = 'theme-toggle';
  btn.type = 'button';
  btn.setAttribute('role', 'switch');
  btn.setAttribute('aria-label', 'Toggle dark mode');
  btn.setAttribute('aria-checked', String(document.documentElement.classList.contains('dark-mode')));
  btn.innerHTML = `<span class="toggle-knob">${SUN_ICON}${MOON_ICON}</span>`;
  btn.addEventListener('click', toggleTheme);
  return btn;
}

document.addEventListener('DOMContentLoaded', () => {
  applyStoredTheme();

  // Insert a theme toggle into every mount point on the page.
  // Desktop/tablet: .theme-toggle-mount-desktop (sits in the navbar)
  // Mobile: .theme-toggle-mount-mobile (sits inside the hamburger menu)
  document.querySelectorAll('.theme-toggle-mount-desktop').forEach(mount => {
    mount.appendChild(buildThemeToggle());
  });
  document.querySelectorAll('.theme-toggle-mount-mobile').forEach(mount => {
    const row = document.createElement('div');
    row.className = 'theme-toggle-row';
    const label = document.createElement('span');
    label.className = 'ttr-label';
    label.textContent = 'Dark mode';
    row.appendChild(label);
    row.appendChild(buildThemeToggle());
    mount.appendChild(row);
  });

  // Hamburger menu open/close
  const hamburger = document.getElementById('hamburgerBtn');
  const mobileMenu = document.getElementById('mobileMenu');
  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      const isOpen = mobileMenu.classList.toggle('open');
      hamburger.classList.toggle('open', isOpen);
      hamburger.setAttribute('aria-expanded', String(isOpen));
    });
  }
});
