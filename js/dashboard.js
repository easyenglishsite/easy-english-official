/* ===========================================================
   Easy English — Dashboard logic
   =========================================================== */

let currentUser = null;
let selectedVideoId = null;
let unlockedVideoIds = new Set();

auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
  currentUser = user;
  // Always prefer the "name" the user actually typed at signup (stored in
  // their Firestore profile) over Firebase Auth's displayName/email — the
  // latter can be the internal synthetic address for phone-based accounts
  // (e.g. "p011...@phone.easyenglish.local"), which should never be shown.
  let displayName = user.displayName || 'Student';
  try {
    const profileDoc = await db.collection('users').doc(user.uid).get();
    if (profileDoc.exists && profileDoc.data().name) {
      displayName = profileDoc.data().name;
    }
  } catch (e) { /* fall back to Auth displayName silently */ }

  const chipText = `👋 ${displayName}`;
  document.getElementById('userChip').textContent = chipText;
  const chipMobile = document.getElementById('userChipMobile');
  if (chipMobile) chipMobile.textContent = chipText;
  await loadUnlocks();
  await loadVideos();
  document.getElementById('loadingOverlay').classList.add('hidden');
});

async function doLogout() {
  sessionStorage.setItem('justLoggedOut', 'true');
  await auth.signOut();
  window.location.href = 'index.html';
}
document.getElementById('logoutBtn').addEventListener('click', doLogout);
const logoutBtnMobile = document.getElementById('logoutBtnMobile');
if (logoutBtnMobile) logoutBtnMobile.addEventListener('click', doLogout);

// ---------------- Load which videos this user has already unlocked ----------------
async function loadUnlocks() {
  const snap = await db.collection('unlocks')
    .where('uid', '==', currentUser.uid)
    .get();
  unlockedVideoIds = new Set(snap.docs.map(d => d.data().videoId));
}

// ---------------- Load & render video cards ----------------
async function loadVideos() {
  const grid = document.getElementById('videoGrid');
  const empty = document.getElementById('emptyState');
  grid.innerHTML = '';

  const snap = await db.collection('videos').orderBy('createdAt', 'desc').get();

  if (snap.empty) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  snap.forEach(doc => {
    const v = doc.data();
    const id = doc.id;
    const isUnlocked = unlockedVideoIds.has(id);

    const card = document.createElement('div');
    card.className = 'video-card';
    card.innerHTML = `
      <div class="video-thumb">
        ${v.thumbnailUrl ? `<img src="${escapeHtml(v.thumbnailUrl)}" alt="${escapeHtml(v.title)}">` : '🎬'}
        <span class="lock-badge ${isUnlocked ? 'unlocked' : ''}">${isUnlocked ? '🔓 Unlocked' : '🔒 Locked'}</span>
      </div>
      <div class="video-card-body">
        <h3>${escapeHtml(v.title)}</h3>
        <p class="desc">${escapeHtml(v.description || '')}</p>
        <button class="btn ${isUnlocked ? 'btn-primary' : 'btn-outline'} btn-block" data-video-id="${id}" data-video-title="${escapeHtml(v.title)}">
          ${isUnlocked ? '▶ Watch Now' : '🔑 Enter Code'}
        </button>
      </div>
    `;
    grid.appendChild(card);

    const btn = card.querySelector('button');
    btn.addEventListener('click', () => {
      if (isUnlocked) {
        window.location.href = `watch.html?video=${id}`;
      } else {
        openRedeemModal(id, v.title);
      }
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// ---------------- Redeem modal ----------------
function openRedeemModal(videoId, title) {
  selectedVideoId = videoId;
  document.getElementById('redeemTitle').textContent = `Unlock: ${title}`;
  document.getElementById('redeemCodeInput').value = '';
  document.getElementById('redeemError').classList.remove('show');
  document.getElementById('redeemModal').classList.add('show');
}
function closeRedeemModal() {
  document.getElementById('redeemModal').classList.remove('show');
  selectedVideoId = null;
}
document.getElementById('redeemModal').addEventListener('click', (e) => {
  if (e.target.id === 'redeemModal') closeRedeemModal();
});

async function submitRedeem() {
  const codeInput = document.getElementById('redeemCodeInput');
  const errEl = document.getElementById('redeemError');
  const btn = document.getElementById('redeemSubmitBtn');
  const code = codeInput.value.trim();
  errEl.classList.remove('show');

  if (!/^\d{8}$/.test(code)) {
    errEl.textContent = 'Please enter a valid 8-digit code.';
    errEl.classList.add('show');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Checking…';

  try {
    const codeRef = db.collection('codes').doc(code);

    // Use a transaction so two people can't redeem the same code at the same instant
    await db.runTransaction(async (tx) => {
      const codeDoc = await tx.get(codeRef);

      if (!codeDoc.exists) {
        throw new Error('This code does not exist.');
      }
      const data = codeDoc.data();
      if (data.status === 'used') {
        throw new Error('This code has already been used.');
      }

      // Mark the code as permanently used (one-time use, any video, any user)
      tx.update(codeRef, {
        status: 'used',
        usedByUid: currentUser.uid,
        usedByEmail: currentUser.email,
        usedForVideoId: selectedVideoId,
        usedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Create the permanent unlock record for this user + video
      const unlockRef = db.collection('unlocks').doc(`${currentUser.uid}_${selectedVideoId}`);
      tx.set(unlockRef, {
        uid: currentUser.uid,
        userEmail: currentUser.email,
        videoId: selectedVideoId,
        code: code,
        unlockedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });

    const unlockedVideoId = selectedVideoId;
    closeRedeemModal();
    await loadUnlocks();
    await loadVideos();
    window.location.href = `watch.html?video=${unlockedVideoId}`;

  } catch (err) {
    errEl.textContent = err.message || 'Something went wrong. Please try again.';
    errEl.classList.add('show');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Unlock';
  }
}

// ---------------- Hidden admin access (triple-click footer) ----------------
let clickCount = 0;
let clickTimer = null;
document.getElementById('copyrightTrigger').addEventListener('click', () => {
  clickCount++;
  clearTimeout(clickTimer);
  clickTimer = setTimeout(() => { clickCount = 0; }, 900);
  if (clickCount === 3) {
    clickCount = 0;
    document.getElementById('adminModal').classList.add('show');
    document.getElementById('adminUser').value = '';
    document.getElementById('adminPass').value = '';
    document.getElementById('adminError').classList.remove('show');
  }
});
function closeAdminModal() {
  document.getElementById('adminModal').classList.remove('show');
}
document.getElementById('adminModal').addEventListener('click', (e) => {
  if (e.target.id === 'adminModal') closeAdminModal();
});
async function attemptAdminLogin() {
  const user = document.getElementById('adminUser').value.trim();
  const pass = document.getElementById('adminPass').value;
  const errEl = document.getElementById('adminError');
  errEl.classList.remove('show');
  if (!user || !pass) {
    errEl.textContent = 'Please fill in both fields.';
    errEl.classList.add('show');
    return;
  }
  try {
    const doc = await db.collection('admin').doc('config').get();
    if (!doc.exists) {
      errEl.textContent = 'Admin not configured yet.';
      errEl.classList.add('show');
      return;
    }
    const data = doc.data();
    if (data.username !== user || data.password !== pass) {
      errEl.textContent = 'Incorrect admin credentials.';
      errEl.classList.add('show');
      return;
    }
    if (!data.authEmail || !data.authPassword) {
      errEl.textContent = 'Admin account not fully configured. See README.';
      errEl.classList.add('show');
      return;
    }

    // NOTE: this switches the browser's Firebase Auth session from the
    // current student account to the hidden admin account. Clicking
    // "Exit Admin" later signs out and returns to the login page, so the
    // student will need to log back in normally afterward.
    await auth.signOut();
    await auth.signInWithEmailAndPassword(data.authEmail, data.authPassword);
    sessionStorage.setItem('adminAuthed', 'true');
    window.location.href = 'admin.html';
  } catch (err) {
    errEl.textContent = 'Could not verify admin access: ' + (err.message || '');
    errEl.classList.add('show');
  }
}
