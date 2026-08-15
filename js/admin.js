/* ===========================================================
   Easy English — Admin panel logic
   Access gate: sessionStorage must have adminAuthed=true,
   which is set only after the correct username/password was
   entered in the triple-click footer modal on index/dashboard.
   =========================================================== */

if (sessionStorage.getItem('adminAuthed') !== 'true') {
  window.location.href = 'index.html';
}

let allVideos = [];
let allUnlocks = [];
let allUsers = [];
let allCodes = [];

// ---------------- Sidebar navigation ----------------
document.querySelectorAll('.admin-nav-item[data-panel]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.admin-nav-item[data-panel]').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`panel-${btn.dataset.panel}`).classList.add('active');
  });
});

document.getElementById('adminLogoutBtn').addEventListener('click', () => {
  sessionStorage.removeItem('adminAuthed');
  window.location.href = 'index.html';
});

// ---------------- Init: load everything ----------------
(async function init() {
  try {
    await Promise.all([loadVideos(), loadCodes(), loadUsers(), loadUnlocks()]);
    renderOverview();
    renderVideosTable();
    renderCodesTable();
    renderUsersTable();
    renderAnalytics();
  } catch (err) {
    console.error(err);
    alert('Could not load admin data. Make sure Firestore rules allow admin reads (see setup guide), and that you are online.');
  } finally {
    document.getElementById('loadingOverlay').classList.add('hidden');
  }
})();

async function loadVideos() {
  const snap = await db.collection('videos').get();
  allVideos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  allVideos.sort((a, b) => {
    const ta = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
    const tb = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
    return tb - ta;
  });
}
async function loadCodes() {
  const snap = await db.collection('codes').get();
  allCodes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  allCodes.sort((a, b) => {
    const ta = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
    const tb = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
    return tb - ta;
  });
}
async function loadUsers() {
  // NOTE: deliberately NOT using .orderBy('createdAt') here — Firestore's
  // orderBy silently EXCLUDES any document missing that field. Older/partial
  // signups (e.g. a doc written a moment before serverTimestamp() resolved,
  // or profiles created before this field existed) would then vanish from
  // this list even though they're real users. We fetch everything and sort
  // client-side instead, so nobody is ever silently dropped.
  const snap = await db.collection('users').get();
  allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  allUsers.sort((a, b) => {
    const ta = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
    const tb = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
    return tb - ta;
  });
}
async function loadUnlocks() {
  const snap = await db.collection('unlocks').get();
  allUnlocks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
function fmtDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ---------------- Overview ----------------
function renderOverview() {
  document.getElementById('statVideos').textContent = allVideos.length;
  document.getElementById('statUsers').textContent = allUsers.length;
  document.getElementById('statCodesTotal').textContent = allCodes.length;
  document.getElementById('statCodesUsed').textContent = allCodes.filter(c => c.status === 'used').length;
}

// ---------------- Videos ----------------
function renderVideosTable() {
  const tbody = document.getElementById('videosTableBody');
  if (allVideos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="small-muted" style="text-align:center; padding:20px;">No videos yet. Create your first one above.</td></tr>`;
    return;
  }
  tbody.innerHTML = allVideos.map(v => {
    const unlockCount = allUnlocks.filter(u => u.videoId === v.id).length;
    return `
      <tr>
        <td><strong>${escapeHtml(v.title)}</strong></td>
        <td class="small-muted">${escapeHtml((v.description || '').slice(0, 60))}${(v.description || '').length > 60 ? '…' : ''}</td>
        <td class="small-muted">${fmtDate(v.createdAt)}</td>
        <td><span class="badge badge-blue">${unlockCount} unlocked</span></td>
        <td><button class="btn btn-danger btn-sm" onclick="openDeleteModal('${v.id}', '${escapeHtml(v.title).replace(/'/g, "\\'")}')">Delete</button></td>
      </tr>
    `;
  }).join('');
}

document.getElementById('createVideoBtn').addEventListener('click', async () => {
  const title = document.getElementById('newVideoTitle').value.trim();
  const desc = document.getElementById('newVideoDesc').value.trim();
  const thumb = document.getElementById('newVideoThumb').value.trim();
  const url = document.getElementById('newVideoUrl').value.trim();
  const errEl = document.getElementById('videoFormError');
  const okEl = document.getElementById('videoFormSuccess');
  errEl.classList.remove('show');
  okEl.classList.remove('show');

  if (!title || !url) {
    errEl.textContent = 'Title and Google Drive video link are required.';
    errEl.classList.add('show');
    return;
  }

  const btn = document.getElementById('createVideoBtn');
  btn.disabled = true;
  btn.textContent = 'Creating…';

  try {
    await db.collection('videos').add({
      title, description: desc, thumbnailUrl: thumb, videoUrl: url,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    okEl.textContent = 'Video card created! It is now live on the site for all users.';
    okEl.classList.add('show');
    document.getElementById('newVideoTitle').value = '';
    document.getElementById('newVideoDesc').value = '';
    document.getElementById('newVideoThumb').value = '';
    document.getElementById('newVideoUrl').value = '';
    await loadVideos();
    renderVideosTable();
    renderOverview();
  } catch (err) {
    errEl.textContent = 'Failed to create video: ' + err.message;
    errEl.classList.add('show');
  } finally {
    btn.disabled = false;
    btn.textContent = '➕ Create Card';
  }
});

let pendingDeleteId = null;
function openDeleteModal(id, title) {
  pendingDeleteId = id;
  document.getElementById('deleteVideoName').textContent = title;
  document.getElementById('deleteModal').classList.add('show');
}
function closeDeleteModal() {
  document.getElementById('deleteModal').classList.remove('show');
  pendingDeleteId = null;
}
document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
  if (!pendingDeleteId) return;
  const btn = document.getElementById('confirmDeleteBtn');
  btn.disabled = true;
  btn.textContent = 'Deleting…';
  try {
    await db.collection('videos').doc(pendingDeleteId).delete();
    await loadVideos();
    renderVideosTable();
    renderOverview();
    closeDeleteModal();
  } catch (err) {
    alert('Failed to delete: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Delete';
  }
});
document.getElementById('deleteModal').addEventListener('click', (e) => {
  if (e.target.id === 'deleteModal') closeDeleteModal();
});

// ---------------- Codes ----------------
function renderCodesTable() {
  const tbody = document.getElementById('codesTableBody');
  if (allCodes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="small-muted" style="text-align:center; padding:20px;">No codes generated yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = allCodes.map(c => {
    const video = allVideos.find(v => v.id === c.usedForVideoId);
    return `
      <tr>
        <td><span class="code-pill mono">${c.id}</span></td>
        <td>${c.status === 'used' ? '<span class="badge badge-gray">Used</span>' : '<span class="badge badge-green">Available</span>'}</td>
        <td class="small-muted">${c.usedByEmail ? escapeHtml(c.usedByEmail) : '—'}</td>
        <td class="small-muted">${video ? escapeHtml(video.title) : '—'}</td>
        <td class="small-muted">${c.usedAt ? fmtDate(c.usedAt) : '—'}</td>
      </tr>
    `;
  }).join('');
}

document.getElementById('generateCodesBtn').addEventListener('click', async () => {
  const btn = document.getElementById('generateCodesBtn');
  btn.disabled = true;
  btn.textContent = 'Generating…';

  try {
    const codes = generateUniqueCodes(30);
    const batch = db.batch();
    codes.forEach(code => {
      const ref = db.collection('codes').doc(code);
      batch.set(ref, {
        status: 'unused',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    await batch.commit();

    document.getElementById('codesResultText').value = codes.join('\n');
    document.getElementById('codesResultModal').classList.add('show');

    await loadCodes();
    renderCodesTable();
    renderOverview();
  } catch (err) {
    alert('Failed to generate codes: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '🎲 Generate 30 New Codes';
  }
});

function generateUniqueCodes(count) {
  const existing = new Set(allCodes.map(c => c.id));
  const result = new Set();
  while (result.size < count) {
    const code = String(Math.floor(10000000 + Math.random() * 90000000)); // 8 digits, no leading zero issue
    if (!existing.has(code) && !result.has(code)) {
      result.add(code);
    }
  }
  return Array.from(result);
}

function closeCodesResultModal() {
  document.getElementById('codesResultModal').classList.remove('show');
}
document.getElementById('copyGeneratedBtn').addEventListener('click', () => {
  const text = document.getElementById('codesResultText').value;
  navigator.clipboard.writeText(text);
  const btn = document.getElementById('copyGeneratedBtn');
  const original = btn.textContent;
  btn.textContent = '✅ Copied!';
  setTimeout(() => btn.textContent = original, 1500);
});
document.getElementById('copyUnusedBtn').addEventListener('click', () => {
  const unused = allCodes.filter(c => c.status !== 'used').map(c => c.id);
  if (unused.length === 0) {
    alert('No unused codes available.');
    return;
  }
  navigator.clipboard.writeText(unused.join('\n'));
  const btn = document.getElementById('copyUnusedBtn');
  const original = btn.textContent;
  btn.textContent = '✅ Copied!';
  setTimeout(() => btn.textContent = original, 1500);
});
document.getElementById('codesResultModal').addEventListener('click', (e) => {
  if (e.target.id === 'codesResultModal') closeCodesResultModal();
});

// ---------------- Video Analytics ----------------
function renderAnalytics() {
  const container = document.getElementById('analyticsList');
  if (!container) return;

  if (allVideos.length === 0) {
    container.innerHTML = `<div class="card-box small-muted" style="text-align:center;">No videos yet — add one in the Videos tab first.</div>`;
    return;
  }

  // Sort videos by purchase count, most-purchased first
  const withCounts = allVideos.map(v => {
    const unlocksForVideo = allUnlocks.filter(u => u.videoId === v.id);
    const viewers = unlocksForVideo.map(u => {
      const userDoc = allUsers.find(usr => usr.id === u.uid);
      const name = (userDoc && userDoc.name) || u.userEmail || 'Unknown user';
      const contact = (userDoc && (userDoc.identifier || userDoc.email || userDoc.phone)) || u.userEmail || '';
      return { name, contact };
    });
    return { video: v, count: unlocksForVideo.length, viewers };
  });
  withCounts.sort((a, b) => b.count - a.count);

  container.innerHTML = withCounts.map(({ video, count, viewers }) => `
    <div class="analytics-video-card">
      <div class="analytics-video-head">
        <h4>${escapeHtml(video.title)}</h4>
        <span class="badge badge-blue">${count} purchase${count === 1 ? '' : 's'}</span>
      </div>
      ${viewers.length === 0
        ? `<p class="small-muted">No one has purchased this video yet.</p>`
        : `<div class="analytics-viewers">
            ${viewers.map(v => `<span class="viewer-chip" title="${escapeHtml(v.contact)}">👤 ${escapeHtml(v.name)}</span>`).join('')}
          </div>`
      }
    </div>
  `).join('');
}

// ---------------- Users ----------------
function renderUsersTable() {
  const tbody = document.getElementById('usersTableBody');
  if (allUsers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="small-muted" style="text-align:center; padding:20px;">No registered users yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = allUsers.map(u => {
    const userUnlocks = allUnlocks.filter(x => x.uid === u.id);
    const titles = userUnlocks.map(x => {
      const v = allVideos.find(vv => vv.id === x.videoId);
      return v ? v.title : '(deleted video)';
    });
    const contact = u.identifier || u.email || u.phone || '—';
    const contactLabel = u.identifierType === 'phone' ? `📱 ${escapeHtml(contact)}` : escapeHtml(contact);
    return `
      <tr>
        <td><strong>${escapeHtml(u.name || 'Unnamed')}</strong></td>
        <td class="small-muted">${contactLabel}</td>
        <td class="small-muted">${fmtDate(u.createdAt)}</td>
        <td class="small-muted">${titles.length ? titles.map(t => `<span class="badge badge-blue" style="margin:2px;">${escapeHtml(t)}</span>`).join('') : '—'}</td>
        <td><button class="btn btn-outline btn-sm" onclick="openEditNameModal('${u.id}', '${escapeHtml(u.name || '').replace(/'/g, "\\'")}')">✏️ Edit name</button></td>
      </tr>
    `;
  }).join('');
}

// ---------------- Edit user display name ----------------
let pendingEditUserId = null;
function openEditNameModal(userId, currentName) {
  pendingEditUserId = userId;
  document.getElementById('editNameInput').value = currentName || '';
  document.getElementById('editNameError').classList.remove('show');
  document.getElementById('editNameModal').classList.add('show');
}
function closeEditNameModal() {
  document.getElementById('editNameModal').classList.remove('show');
  pendingEditUserId = null;
}
document.getElementById('editNameModal').addEventListener('click', (e) => {
  if (e.target.id === 'editNameModal') closeEditNameModal();
});
document.getElementById('saveEditNameBtn').addEventListener('click', async () => {
  const errEl = document.getElementById('editNameError');
  errEl.classList.remove('show');
  const newName = document.getElementById('editNameInput').value.trim();

  if (!pendingEditUserId) return;
  if (!newName) {
    errEl.textContent = 'Please enter a name.';
    errEl.classList.add('show');
    return;
  }

  const btn = document.getElementById('saveEditNameBtn');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    await db.collection('users').doc(pendingEditUserId).update({ name: newName });
    await loadUsers();
    renderUsersTable();
    renderOverview();
    renderAnalytics();
    closeEditNameModal();
  } catch (err) {
    errEl.textContent = 'Failed to save: ' + (err.message || 'check Firestore rules are up to date (see README).');
    errEl.classList.add('show');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save';
  }
});
