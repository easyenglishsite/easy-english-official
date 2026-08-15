/* ===========================================================
   Easy English — Watch page logic
   Verifies the current user unlocked this video, then plays it
   with a slowly-moving username watermark to discourage recording.
   =========================================================== */

const params = new URLSearchParams(window.location.search);
const videoId = params.get('video');

auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
  if (!videoId) {
    window.location.href = 'dashboard.html';
    return;
  }

  try {
    // 1. Confirm this user has unlocked this specific video
    const unlockDoc = await db.collection('unlocks').doc(`${user.uid}_${videoId}`).get();

    if (!unlockDoc.exists) {
      document.getElementById('loadingOverlay').classList.add('hidden');
      document.getElementById('playerShell').style.display = 'none';
      document.getElementById('deniedBox').style.display = 'block';
      return;
    }

    // 2. Load the video's data
    const videoDoc = await db.collection('videos').doc(videoId).get();
    if (!videoDoc.exists) {
      document.getElementById('loadingOverlay').classList.add('hidden');
      document.getElementById('playerShell').style.display = 'none';
      document.getElementById('deniedBox').style.display = 'block';
      document.getElementById('deniedBox').querySelector('h3').textContent = '⚠️ Video not found';
      document.getElementById('deniedBox').querySelector('p').textContent = 'This video may have been removed by the admin.';
      return;
    }

    const v = videoDoc.data();
    document.getElementById('videoTitle').textContent = v.title;
    document.getElementById('videoDesc').textContent = v.description || '';

    const player = document.getElementById('videoPlayer');
    player.src = toDriveEmbedLink(v.videoUrl);

    // 3. Set up the moving watermark with this user's real name + contact
    // (never the internal synthetic phone-login address). Showing both
    // keeps the watermark identifying enough to still deter recording.
    let displayName = user.displayName || 'Student';
    let displayIdentifier = '';
    try {
      const profileDoc = await db.collection('users').doc(user.uid).get();
      if (profileDoc.exists) {
        const data = profileDoc.data();
        if (data.name) displayName = data.name;
        if (data.identifier) displayIdentifier = data.identifier;
      }
    } catch (e) { /* fall back silently */ }
    const watermarkLabel = displayIdentifier ? `${displayName} • ${displayIdentifier}` : displayName;
    setupWatermark(watermarkLabel);

    document.getElementById('loadingOverlay').classList.add('hidden');

  } catch (err) {
    console.error(err);
    document.getElementById('loadingOverlay').classList.add('hidden');
    alert('Something went wrong loading this video. Please try again.');
  }
});

// Converts a normal Google Drive share link into an embeddable player link.
// Share link looks like: https://drive.google.com/file/d/FILE_ID/view?usp=sharing
//
// IMPORTANT: Drive's "uc?export=download" endpoint is NOT a video stream —
// it's an HTML download/confirmation page (or gets blocked by Drive's virus
// scan warning for larger files), so a plain <video src="..."> can never
// play it; that's why the watermark showed but the video never loaded.
// Google Drive's own embeddable player lives at "/preview", which is
// designed to be placed inside an <iframe> and reliably streams the file
// with built-in playback controls, across browsers and file sizes.
function toDriveEmbedLink(url) {
  if (!url) return '';
  const match = url.match(/\/d\/(.*?)(\/|$)/) || url.match(/id=([^&]+)/);
  if (match && match[1]) {
    return `https://drive.google.com/file/d/${match[1]}/preview`;
  }
  return url; // fallback: assume it's already a direct/embeddable link
}

// ---------------- Moving watermark ----------------
function setupWatermark(label) {
  const wm = document.getElementById('watermark');
  const shell = document.getElementById('playerShell');
  wm.textContent = label;

  function randomPosition() {
    const shellRect = shell.getBoundingClientRect();
    const maxLeft = Math.max(shellRect.width - 220, 20);
    const maxTop = Math.max(shellRect.height - 40, 20);
    const left = Math.floor(Math.random() * maxLeft);
    const top = Math.floor(Math.random() * maxTop);
    wm.style.left = left + 'px';
    wm.style.top = top + 'px';
  }

  randomPosition();
  // Move slowly to a new random spot every few seconds (CSS transition makes it glide)
  setInterval(randomPosition, 4500);
}

// Extra light deterrents (not foolproof, but raises friction)
document.addEventListener('keydown', (e) => {
  if (e.key === 'PrintScreen') {
    navigator.clipboard.writeText('');
  }
});
