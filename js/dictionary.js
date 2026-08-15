/* ===========================================================
   Easy English — Dictionary page logic
   -----------------------------------------------------------
   Looks up English words using two free, keyless public APIs:
     1. Free Dictionary API (api.dictionaryapi.dev) — definitions,
        parts of speech, examples, and British/American audio
        pronunciation where available.
     2. MyMemory Translation API (api.mymemory.translated.net) —
        machine translation for the Arabic meaning.
   This is NOT the Cambridge Dictionary — Cambridge's own API is
   gated behind a developer key you have to apply for directly
   with Cambridge, so it isn't something that can be wired in for
   free. This combination gets the same end result (definition +
   Arabic meaning + UK/US pronunciation) using open, no-key APIs.
   =========================================================== */

const DICT_API = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
const TRANSLATE_API = 'https://api.mymemory.translated.net/get';
const RECENT_KEY = 'ee-dict-recent';
const MAX_RECENT = 8;

let currentUser = null;

// ---------------- Auth guard + shared nav (same pattern as dashboard.js) ----------------
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
  currentUser = user;

  let displayName = user.displayName || 'Student';
  try {
    const profileDoc = await db.collection('users').doc(user.uid).get();
    if (profileDoc.exists && profileDoc.data().name) {
      displayName = profileDoc.data().name;
    }
  } catch (e) { /* fall back silently */ }

  const chipText = `👋 ${displayName}`;
  const chip = document.getElementById('userChip');
  if (chip) chip.textContent = chipText;
  const chipMobile = document.getElementById('userChipMobile');
  if (chipMobile) chipMobile.textContent = chipText;

  document.getElementById('loadingOverlay').classList.add('hidden');
  renderRecent();
});

async function doLogout() {
  sessionStorage.setItem('justLoggedOut', 'true');
  await auth.signOut();
  window.location.href = 'index.html';
}
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) logoutBtn.addEventListener('click', doLogout);
const logoutBtnMobile = document.getElementById('logoutBtnMobile');
if (logoutBtnMobile) logoutBtnMobile.addEventListener('click', doLogout);

// ---------------- Hidden admin access (triple-click footer) — same as other pages ----------------
let clickCount = 0;
let clickTimer = null;
const copyrightTrigger = document.getElementById('copyrightTrigger');
if (copyrightTrigger) {
  copyrightTrigger.addEventListener('click', () => {
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
}
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
    await auth.signOut();
    await auth.signInWithEmailAndPassword(data.authEmail, data.authPassword);
    sessionStorage.setItem('adminAuthed', 'true');
    window.location.href = 'admin.html';
  } catch (err) {
    errEl.textContent = 'Could not verify admin access: ' + (err.message || '');
    errEl.classList.add('show');
  }
}

// ---------------- Recent searches (stored locally per browser) ----------------
function getRecent() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch (e) { return []; }
}
function addRecent(word) {
  let recent = getRecent().filter(w => w.toLowerCase() !== word.toLowerCase());
  recent.unshift(word);
  recent = recent.slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
}
function renderRecent() {
  const recent = getRecent();
  const existing = document.getElementById('dictRecentBlock');
  if (existing) existing.remove();
  if (recent.length === 0) return;

  const emptyState = document.getElementById('dictEmptyState');
  if (!emptyState) return; // a search result is currently showing, don't clutter it

  const block = document.createElement('div');
  block.id = 'dictRecentBlock';
  block.className = 'dict-recent';
  block.innerHTML = recent.map(w => `<button type="button">${escapeHtml(w)}</button>`).join('');
  emptyState.after(block);
  block.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('dictSearchInput').value = btn.textContent;
      performSearch();
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// ---------------- Search ----------------
const searchInput = document.getElementById('dictSearchInput');
const searchBtn = document.getElementById('dictSearchBtn');
searchBtn.addEventListener('click', performSearch);
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); performSearch(); }
});

async function performSearch() {
  const word = searchInput.value.trim();
  if (!word) return;

  const content = document.getElementById('dictContent');
  content.innerHTML = `
    <div class="dict-loading">
      <div class="spinner" style="margin:0 auto 14px;"></div>
      <p>Looking up "${escapeHtml(word)}"…</p>
    </div>
  `;

  try {
    // Run independently (not Promise.all) so a hiccup in one API can't
    // sink a perfectly good result from the other — e.g. if the Arabic
    // translation service is briefly down, the English definition should
    // still render instead of showing a blanket error.
    const defPromise = fetchDefinition(word).catch(() => 'network-error');
    const arabicPromise = fetchArabicTranslation(word);
    const [defResult, arabicText] = await Promise.all([defPromise, arabicPromise]);

    if (defResult === 'network-error') {
      content.innerHTML = `
        <div class="dict-error">
          <div class="icon">⚠️</div>
          <p>Couldn't reach the dictionary service.</p>
          <p class="small-muted mt-8">If you're using an ad-blocker or a browser privacy shield (e.g. Brave Shields), try turning it off for this site — it can block the lookup. Otherwise, check your connection and try again.</p>
        </div>
      `;
      return;
    }

    if (!defResult) {
      content.innerHTML = `
        <div class="dict-error">
          <div class="icon">🤷</div>
          <p><strong>"${escapeHtml(word)}"</strong> wasn't found.</p>
          <p class="small-muted mt-8">Check the spelling, or try a simpler/base form of the word (e.g. "run" instead of "running").</p>
        </div>
      `;
      return;
    }

    renderResult(defResult, arabicText, word);
    addRecent(defResult.word || word);

  } catch (err) {
    console.error(err);
    content.innerHTML = `
      <div class="dict-error">
        <div class="icon">⚠️</div>
        <p>Something went wrong looking that word up.</p>
        <p class="small-muted mt-8">Please check your connection and try again.</p>
      </div>
    `;
  }
}

// Fetches the definition entry from the Free Dictionary API.
// Distinguishes "word not found" (a normal 404 — not an error) from an
// actual network/CORS failure, so callers can show the right message
// instead of a generic "something went wrong" for a plain 404.
async function fetchDefinition(word) {
  let res;
  try {
    res = await fetch(DICT_API + encodeURIComponent(word));
  } catch (e) {
    // Network-level failure: offline, CORS block, ad-blocker/privacy
    // extension (e.g. Brave Shields) intercepting the cross-origin request, etc.
    throw new Error('network');
  }
  if (res.status === 404) return null; // word genuinely not found
  if (!res.ok) throw new Error('network');
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;
  return data[0];
}

// Fetches an Arabic translation via MyMemory. Falls back gracefully to
// null (rendered as "translation unavailable") rather than breaking the
// whole lookup if the translation service is briefly unavailable.
async function fetchArabicTranslation(word) {
  try {
    const params = new URLSearchParams({ q: word, langpair: 'en|ar' });
    const res = await fetch(`${TRANSLATE_API}?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.responseStatus !== 200) return null;
    return data.responseData.translatedText || null;
  } catch (e) {
    return null;
  }
}

// Picks the best British and American audio/phonetic text out of the
// "phonetics" array. The Free Dictionary API doesn't always label which
// entry is UK vs US, so we match on the audio filename convention
// ("_gb_" / "_us_") that the underlying Google dictionary audio uses,
// falling back to "first available" / "second available" if unlabeled.
function pickPronunciations(entry) {
  const phonetics = (entry.phonetics || []).filter(p => p.text || p.audio);
  let uk = phonetics.find(p => p.audio && p.audio.includes('_gb_'));
  let us = phonetics.find(p => p.audio && p.audio.includes('_us_'));

  if (!uk) uk = phonetics.find(p => p.audio && !p.audio.includes('_us_')) || phonetics[0];
  if (!us) us = phonetics.find(p => p.audio && p !== uk && p.audio.includes('_us_'));
  if (!us) us = phonetics.find(p => p !== uk && p.audio);

  return {
    uk: uk || (entry.phonetic ? { text: entry.phonetic } : null),
    us: us || null
  };
}

function playAudio(url, btn, fallbackWord, fallbackLang) {
  // Falls back to the browser's own built-in text-to-speech (Web Speech
  // API) whenever the recorded audio file is missing or fails to load —
  // Google's dictionary audio links (gstatic.com) go stale/404 for many
  // words, so relying on them alone leaves pronunciation broken often.
  // speechSynthesis works fully offline-of-network, in every modern
  // browser, with no CORS/hotlinking issues at all.
  function speakFallback() {
    if (!fallbackWord || !('speechSynthesis' in window)) return;
    try {
      const utter = new SpeechSynthesisUtterance(fallbackWord);
      utter.lang = fallbackLang || 'en-US';
      if (btn) {
        utter.onend = () => { btn.disabled = false; btn.textContent = '▶'; };
        utter.onerror = () => { btn.disabled = false; btn.textContent = '▶'; };
      }
      window.speechSynthesis.cancel(); // stop any overlapping previous utterance
      window.speechSynthesis.speak(utter);
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = '▶'; }
    }
  }

  if (!url) {
    if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
    speakFallback();
    return;
  }

  const src = url.startsWith('//') ? 'https:' + url : url;
  const audio = new Audio(src);
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳';
    audio.addEventListener('ended', () => { btn.disabled = false; btn.textContent = '▶'; });
  }
  audio.addEventListener('error', speakFallback);
  audio.play().catch(speakFallback);
}

function renderResult(entry, arabicText, searchedWord) {
  const content = document.getElementById('dictContent');
  const { uk, us } = pickPronunciations(entry);
  const wordForSpeech = entry.word || searchedWord;

  const pronRow = `
    <div class="dict-pron-row">
      ${uk ? `
        <span class="dict-pron-chip">
          <span class="flag">🇬🇧</span> British ${uk.text ? escapeHtml(uk.text) : ''}
          <button type="button" data-audio="${uk.audio ? escapeHtml(uk.audio) : ''}" data-lang="en-GB" aria-label="Play British pronunciation">▶</button>
        </span>` : ''}
      ${us ? `
        <span class="dict-pron-chip">
          <span class="flag">🇺🇸</span> American ${us.text ? escapeHtml(us.text) : ''}
          <button type="button" data-audio="${us.audio ? escapeHtml(us.audio) : ''}" data-lang="en-US" aria-label="Play American pronunciation">▶</button>
        </span>` : ''}
      ${!uk && !us ? `
        <span class="dict-pron-chip">
          <button type="button" data-audio="" data-lang="en-US" aria-label="Play pronunciation">▶ Listen</button>
        </span>` : ''}
    </div>
  `;

  const meaningsHtml = (entry.meanings || []).map(m => {
    const defsHtml = (m.definitions || []).slice(0, 5).map((d, i) => `
      <div class="dict-def-item">
        <span class="def-num">${i + 1}.</span>${escapeHtml(d.definition)}
        ${d.example ? `<div class="example">"${escapeHtml(d.example)}"</div>` : ''}
      </div>
    `).join('');
    return `
      <div class="dict-meaning-block">
        <span class="dict-pos">${escapeHtml(m.partOfSpeech || '')}</span>
        ${defsHtml}
      </div>
    `;
  }).join('');

  content.innerHTML = `
    <div class="dict-result">
      <div class="dict-word-head">
        <h2>${escapeHtml(entry.word || searchedWord)}</h2>
        ${arabicText ? `<span class="dict-arabic">${escapeHtml(arabicText)}</span>` : `<span class="small-muted">Arabic translation unavailable right now</span>`}
      </div>
      ${pronRow}
      ${meaningsHtml || '<p class="small-muted">No definitions found for this word.</p>'}
    </div>
  `;

  content.querySelectorAll('[data-audio]').forEach(btn => {
    btn.addEventListener('click', () => {
      playAudio(btn.getAttribute('data-audio'), btn, wordForSpeech, btn.getAttribute('data-lang'));
    });
  });
}
