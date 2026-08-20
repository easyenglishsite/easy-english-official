/* ===========================================================
   Easy English — Auth page logic
   =========================================================== */

// ---- If already logged in as a normal user, skip straight to dashboard ----
auth.onAuthStateChanged((user) => {
  if (user && !sessionStorage.getItem('justLoggedOut')) {
    window.location.href = 'dashboard.html';
  }
  sessionStorage.removeItem('justLoggedOut');
});

// ---------------- Device/session tracking (for admin "logged-in devices" count) ----------------
// Each browser/device gets a random id stored in localStorage so repeat logins
// from the SAME device update one record instead of inflating the count.
function getDeviceId() {
  let id = localStorage.getItem('eeDeviceId');
  if (!id) {
    id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('eeDeviceId', id);
  }
  return id;
}
async function recordDeviceSession(uid) {
  try {
    const deviceId = getDeviceId();
    await db.collection('sessions').doc(`${uid}_${deviceId}`).set({
      uid: uid,
      deviceId: deviceId,
      userAgent: navigator.userAgent,
      lastLoginAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (e) { /* never block login on this */ }
}

function showCard(which) {
  document.getElementById('loginCard').style.display = which === 'login' ? 'block' : 'none';
  document.getElementById('signupCard').style.display = which === 'signup' ? 'block' : 'none';
  hideMsg('loginError'); hideMsg('signupError');
}

/* ===========================================================
   Email-or-Phone identifier handling
   -----------------------------------------------------------
   Firebase Auth's Email/Password provider needs an email-shaped
   string. Since we don't want phone verification (per spec —
   typing a phone number in is enough, same as email), we map a
   phone number to a synthetic internal email:
     "+1 555 123 4567"  ->  "p15551234567@phone.easyenglish.local"
   The user's real typed identifier (email or phone, as-is) is
   still stored in their Firestore profile ("identifier" field,
   plus "email"/"phone" individually) so the admin panel and
   login-by-either-field both work normally.
   =========================================================== */

const PHONE_DOMAIN = 'phone.easyenglish.local';

function isEmailLike(str) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
}

function isPhoneLike(str) {
  const digits = str.replace(/[^\d]/g, '');
  return digits.length >= 7 && digits.length <= 15 && /^[\d+\-\s().]+$/.test(str);
}

// Turns whatever the user typed (email or phone) into the string
// we actually pass to Firebase Auth as the "email" field.
function identifierToAuthEmail(raw) {
  const value = raw.trim();
  if (isEmailLike(value)) {
    return { authEmail: value.toLowerCase(), type: 'email', display: value };
  }
  if (isPhoneLike(value)) {
    const digits = value.replace(/[^\d]/g, '');
    return { authEmail: `p${digits}@${PHONE_DOMAIN}`, type: 'phone', display: value };
  }
  return null;
}

function updateIdentifierHint() {
  const el = document.getElementById('signupIdentifier');
  const hint = document.getElementById('signupIdentifierHint');
  if (!el || !hint) return;
  const val = el.value.trim();
  if (!val) { hint.textContent = ''; return; }
  if (isEmailLike(val)) { hint.textContent = "We'll use this as your email login."; return; }
  if (isPhoneLike(val)) { hint.textContent = "We'll use this as your phone login — no verification needed."; return; }
  hint.textContent = 'Enter a valid email address or phone number.';
}
document.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('signupIdentifier');
  if (el) el.addEventListener('input', updateIdentifierHint);
});

function togglePass(id, el) {
  const input = document.getElementById(id);
  if (input.type === 'password') {
    input.type = 'text';
    el.textContent = 'Hide';
  } else {
    input.type = 'password';
    el.textContent = 'Show';
  }
}

function showMsg(id, text) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.classList.add('show');
}
function hideMsg(id) {
  document.getElementById(id).classList.remove('show');
}

function setLoading(btnTextId, btnId, isLoading, label) {
  const btn = document.getElementById(btnId);
  const txt = document.getElementById(btnTextId);
  btn.disabled = isLoading;
  txt.textContent = isLoading ? 'Please wait…' : label;
}

// ---------------- LOGIN ----------------
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMsg('loginError'); hideMsg('loginSuccess');
  const raw = document.getElementById('loginIdentifier').value.trim();
  const password = document.getElementById('loginPassword').value;

  const parsed = identifierToAuthEmail(raw);
  if (!parsed) {
    showMsg('loginError', 'Please enter a valid email address or phone number.');
    return;
  }

  setLoading('loginBtnText', 'loginBtn', true, 'Log In');
  try {
    const cred = await auth.signInWithEmailAndPassword(parsed.authEmail, password);
    await recordDeviceSession(cred.user.uid);
    window.location.href = 'dashboard.html';
  } catch (err) {
    showMsg('loginError', friendlyError(err));
  } finally {
    setLoading('loginBtnText', 'loginBtn', false, 'Log In');
  }
});

// ---------------- SIGNUP ----------------
document.getElementById('signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMsg('signupError');
  const name = document.getElementById('signupName').value.trim();
  const raw = document.getElementById('signupIdentifier').value.trim();
  const password = document.getElementById('signupPassword').value;

  const parsed = identifierToAuthEmail(raw);
  if (!parsed) {
    showMsg('signupError', 'Please enter a valid email address or phone number.');
    return;
  }

  setLoading('signupBtnText', 'signupBtn', true, 'Create Account');
  try {
    const cred = await auth.createUserWithEmailAndPassword(parsed.authEmail, password);
    await cred.user.updateProfile({ displayName: name });

    const profileData = {
      name: name,
      email: parsed.type === 'email' ? parsed.display : '',
      phone: parsed.type === 'phone' ? parsed.display : '',
      identifier: parsed.display,
      identifierType: parsed.type,
      authEmail: parsed.authEmail,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
      await db.collection('users').doc(cred.user.uid).set(profileData);
    } catch (profileErr) {
      // The Auth account now exists even though this write failed (e.g. a
      // rules/permission issue) — don't leave the person stuck on an error
      // screen with an orphaned account. Retry once; if it still fails,
      // dashboard.js's self-healing check will create the profile the next
      // time they successfully load the dashboard.
      console.error('Profile write failed on signup, will retry on next login:', profileErr);
      try { await db.collection('users').doc(cred.user.uid).set(profileData); } catch (e2) { /* leave to self-heal */ }
    }

    await recordDeviceSession(cred.user.uid);
    window.location.href = 'dashboard.html';
  } catch (err) {
    showMsg('signupError', friendlyError(err));
  } finally {
    setLoading('signupBtnText', 'signupBtn', false, 'Create Account');
  }
});

// If a Google account has no displayName, fall back to a name derived
// from their email: the part before "@", capitalized. If that local
// part is unusually long we trim it to 6 characters so it still reads
// like a short name rather than a whole email handle.
function nameFromEmail(email) {
  if (!email) return 'Student';
  const local = email.split('@')[0] || 'Student';
  const trimmed = local.length > 6 ? local.slice(0, 6) : local;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

// ---------------- GOOGLE SIGN-IN ----------------
const googleProvider = new firebase.auth.GoogleAuthProvider();

async function handleGoogleSignIn() {
  hideMsg('loginError'); hideMsg('signupError');
  try {
    const result = await auth.signInWithPopup(googleProvider);
    const user = result.user;

    // If this is their first time (no profile doc yet), create one
    const userDoc = await db.collection('users').doc(user.uid).get();
    if (!userDoc.exists) {
      await db.collection('users').doc(user.uid).set({
        name: user.displayName || nameFromEmail(user.email),
        email: user.email,
        phone: '',
        identifier: user.email,
        identifierType: 'email',
        authEmail: user.email,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    await recordDeviceSession(user.uid);
    window.location.href = 'dashboard.html';
  } catch (err) {
    if (err.code === 'auth/popup-closed-by-user') return; // user just cancelled, no error needed
    showMsg('loginError', friendlyError(err));
  }
}

document.getElementById('googleLoginBtn').addEventListener('click', handleGoogleSignIn);
document.getElementById('googleSignupBtn').addEventListener('click', handleGoogleSignIn);

function friendlyError(err) {
  const map = {
    'auth/email-already-in-use': 'This email is already registered. Try logging in instead.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/weak-password': 'Password should be at least 6 characters.',
    'auth/user-not-found': 'No account found with this email or phone number.',
    'auth/wrong-password': 'Incorrect password. Please try again.',
    'auth/invalid-credential': 'Incorrect email/phone or password.',
    'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
    'auth/popup-blocked': 'Your browser blocked the Google sign-in popup. Please allow popups and try again.',
    'auth/account-exists-with-different-credential': 'This email is already registered with a password. Please log in with your email and password instead.'
  };
  return map[err.code] || err.message;
}

// ---------------- HIDDEN ADMIN ACCESS (triple-click copyright) ----------------
let clickCount = 0;
let clickTimer = null;

document.getElementById('copyrightTrigger').addEventListener('click', () => {
  clickCount++;
  clearTimeout(clickTimer);
  clickTimer = setTimeout(() => { clickCount = 0; }, 900);

  if (clickCount === 3) {
    clickCount = 0;
    openAdminModal();
  }
});

function openAdminModal() {
  document.getElementById('adminModal').classList.add('show');
  document.getElementById('adminUser').value = '';
  document.getElementById('adminPass').value = '';
  hideMsg('adminError');
}
function closeAdminModal() {
  document.getElementById('adminModal').classList.remove('show');
}

async function attemptAdminLogin() {
  const user = document.getElementById('adminUser').value.trim();
  const pass = document.getElementById('adminPass').value;
  hideMsg('adminError');

  if (!user || !pass) {
    showMsg('adminError', 'Please fill in both fields.');
    return;
  }

  try {
    const doc = await db.collection('admin').doc('config').get();
    if (!doc.exists) {
      showMsg('adminError', 'Admin not configured yet. See setup guide.');
      return;
    }
    const data = doc.data();
    if (data.username !== user || data.password !== pass) {
      showMsg('adminError', 'Incorrect admin credentials.');
      return;
    }

    // Password check passed. Now sign into the hidden admin Firebase Auth
    // account so Firestore rules (which require request.auth != null) work
    // normally for the admin panel too — no rule loosening needed.
    if (!data.authEmail || !data.authPassword) {
      showMsg('adminError', 'Admin account not fully configured. See README "Admin account setup".');
      return;
    }

    await auth.signInWithEmailAndPassword(data.authEmail, data.authPassword);
    sessionStorage.setItem('adminAuthed', 'true');
    window.location.href = 'admin.html';

  } catch (err) {
    showMsg('adminError', 'Could not verify admin access: ' + (err.message || 'check your connection.'));
  }
}

// Close modal on outside click
document.getElementById('adminModal').addEventListener('click', (e) => {
  if (e.target.id === 'adminModal') closeAdminModal();
});
