# Easy English — Setup Guide

A course website with locked videos, one-time 8-digit access codes, an admin
panel, and a moving watermark player. Built with plain HTML/CSS/JS +
Firebase (free "Spark" plan — no credit card, no trial expiry).

---

## 1. Create your Firebase project (free)

1. Go to https://console.firebase.google.com and click **Add project**.
2. Name it (e.g. `easy-english`), disable Google Analytics (optional), create it.
3. In the left sidebar, click the **</> (Web)** icon to register a web app.
   Give it a nickname, click **Register app**.
4. Firebase will show you a `firebaseConfig` object. Copy it.
5. Open `js/firebase-config.js` in this project and paste your values in,
   replacing the placeholder text.

## 2. Turn on Email/Password login

1. In Firebase Console, go to **Build → Authentication → Get started**.
2. Under "Sign-in method", enable **Email/Password**. Save.

## 3. Turn on Firestore (the database)

1. Go to **Build → Firestore Database → Create database**.
2. Choose **Start in production mode**, pick a region close to your users, Enable.
3. Go to the **Rules** tab, delete everything, and paste the contents of
   `firestore.rules` (included in this project). Click **Publish**.

⚠️ **Whenever `firestore.rules` changes in this project** (including the
update that added admin edit-name permissions), you must repeat step 3 —
copy the new file's contents into the Rules tab and click Publish again.
Nothing updates automatically; the live rules only change when you paste
and publish them yourself.

**If the admin panel's "Registered Users" count shows 0 even though real
people have signed up**, it's almost always one of these — not a bug in
the app itself:
- The rules pasted into the Firebase Console are older than the ones in
  this repo (re-paste and Publish `firestore.rules` again).
- `admin/config` is missing/misconfigured (`authEmail`/`authPassword`
  don't match a real account in **Authentication → Users**), so the
  admin panel's hidden sign-in silently fails and the `/users` read is
  then rejected by the rules (which require `request.auth != null`).
- You're looking at a different Firebase **project** than the one the
  site is actually wired to (check `js/firebase-config.js` — the
  `projectId` there must match the project where the 3 users actually
  signed up).
Open the browser console (F12) on the admin page while it loads — if
the panel is failing to read `/users`, you'll see a `permission-denied`
or network error there, which tells you which of the above it is.

## 4. Set up your admin login

The admin login is separate from normal user accounts, and uses two layers:
a memorable username/password you type into the popup, plus a hidden real
Firebase account behind the scenes that makes Firestore's security rules work
correctly for the admin panel (this is what actually protects your data).

**Step A — create the hidden admin auth account:**
1. In Firebase Console, go to **Build → Authentication → Users tab**.
2. Click **Add user**.
3. Enter any email (e.g. `admin@easyenglish.internal` — doesn't need to be
   real/reachable) and a strong password. Click **Add user**.
4. This account will never be shown to anyone — it's only used internally.

**Step B — set your admin config document:**
1. Go to **Build → Firestore Database → Data tab**.
2. Click **Start collection**. Collection ID: `admin`
3. Document ID: `config`
4. Add five fields, all type **string** (except `adminUid`, see below):
   - `username` → the memorable username YOU will type into the popup (can be anything, e.g. `miido`)
   - `password` → the memorable password YOU will type into the popup (can be anything, e.g. a normal password you'll remember)
   - `authEmail` → the exact email you used in Step A
   - `authPassword` → the exact password you used in Step A
   - `adminUid` → the **UID** of the hidden admin account from Step A (type **string**). Find it in
     **Build → Authentication → Users** — click on the row for the admin
     email you created and copy the "User UID" value shown there. This is
     what lets Firestore rules recognize the admin account specifically
     (e.g. to allow it, and only it, to edit a user's display name from
     the admin panel's Users tab).
5. Save.

To open the admin panel on the live site: go to the login page, scroll to the
footer, and **click the copyright text 3 times quickly**. Enter the
`username`/`password` from Step B (not the authEmail/authPassword — those
are internal only).

⚠️ Don't reuse an important personal password for either of these — treat
them as site-only credentials.

## 5. Upload videos to Google Drive

1. Upload your course video to Google Drive.
2. Right-click it → **Share** → change access to **"Anyone with the link"**
   → set role to **Viewer** → Copy link.
3. In the admin panel → Videos tab, paste that link into "Google Drive Video
   Link" when creating a card.

The site automatically converts the normal share link into Google Drive's
own embeddable player (loaded in an `<iframe>`) so it plays reliably in the
browser. Earlier versions of this project tried to point a plain `<video>`
tag at Drive's `uc?export=download` link — that endpoint is a download/
virus-scan confirmation page, not an actual video stream, so the video
never played even though the watermark rendered fine. The `/preview` embed
endpoint used now is the correct, supported way to stream a Drive file in
a web page.

**Note on Drive limits:** Google Drive direct-stream links can be rate
limited for very popular files (roughly 100+ views/day on one file can start
throttling). This is fine for a course with a modest number of students; if
you outgrow it, consider moving videos to Firebase Storage, Bunny.net, or
Cloudflare Stream later.

## 6. Deploy to GitHub Pages

1. Create a new GitHub repository, e.g. `easy-english-site`.
2. Upload every file in this project (keeping the folder structure).
3. Go to repo **Settings → Pages**.
4. Under "Build and deployment", set Source = **Deploy from a branch**,
   Branch = `main`, folder = `/ (root)`. Save.
5. After a minute, your site will be live at:
   `https://YOUR-USERNAME.github.io/easy-english-site/`

## 7. Using the site day-to-day

- **Students**: go to the site → Create Account → Log in → see locked video
  cards → click a card → enter the 8-digit code you gave them → video
  unlocks permanently on their account.
- **You (admin)**: triple-click the footer copyright → log in with your
  admin username/password → Videos tab to add/delete courses → Codes tab to
  generate 30 new codes at a time (each usable once, by one person, for one
  video, ever) → Users tab to see who's signed up and what they've unlocked.

## How the one-time code system works

- Every code is a random 8-digit number, generated in batches of 30 from
  the admin panel.
- A code starts as `unused`.
- When any logged-in user enters a valid unused code on ANY video card, that
  code becomes `used` forever — tied permanently to that user and that video.
- The video then stays unlocked for that user's account forever (until you,
  the admin, delete the video entirely).
- The same code can never be used again — not for another video, not by
  another person, not even by the same person again.

## Files in this project

```
easy-english/
├── index.html          Login / Create Account page
├── dashboard.html       Video card grid for logged-in users
├── dictionary.html      Word lookup: definitions, Arabic meaning, UK/US audio
├── watch.html           Custom video player with moving watermark
├── admin.html           Admin panel (videos, codes, users, analytics)
├── firestore.rules      Copy into Firebase Console → Firestore → Rules
├── css/style.css        All styling (light/dark theme, fully responsive)
└── js/
    ├── firebase-config.js   <- YOU EDIT THIS with your Firebase keys
    ├── auth.js               Login/signup (email or phone) + admin access modal
    ├── theme.js               Dark mode toggle + mobile hamburger menu
    ├── dashboard.js           Video grid + code redemption
    ├── dictionary.js          Word lookup logic (definitions + translation + audio)
    ├── watch.js               Player + watermark logic
    └── admin.js               Admin panel logic + video analytics
```

## Logging in with email or phone number

Students can sign up and log in with **either** an email address or a phone
number, typed into the same field — no phone verification step, exactly
like typing an email. Under the hood, Firebase Authentication's
Email/Password provider needs an email-shaped value to work with, so a
phone number is mapped to an internal address behind the scenes (e.g.
`+1 555 123 4567` becomes `p15551234567@phone.easyenglish.local`). This is
invisible to the student — their real typed email or phone number is what's
shown in the navbar, the admin Users table, and the video watermark. It's
stored on their profile document under `identifier` (plus `email`/`phone`
individually), and login looks it up the same way regardless of which one
they used to sign up.

**One thing to know:** since there's no verification step, the phone number
is matched by its digits exactly as typed — so a student should log in
using the same formatting they signed up with (e.g. always including the
country code, or always leaving it off). This is a normal trade-off of
skipping phone verification.

## Dark mode

Every page (login, dashboard, watch, admin) has a sun/moon toggle switch
that smoothly animates between light and dark themes. On desktop and
tablet it sits in the top navbar; on phones it's inside the hamburger menu.
The choice is remembered (via `localStorage`) and applied instantly on
page load, before the page paints, so there's no flash of the wrong theme.

## Mobile navigation

On narrow screens, the navbar's user name/logout buttons collapse behind a
hamburger icon instead of being shown inline, to keep the header usable on
phones. Tapping it slides open a menu with the same actions plus the dark
mode toggle.

## Editing a user's display name (admin)

In the admin panel's **Users** tab, click **✏️ Edit name** on any row to
change what that person's name shows as across the site (navbar, Users
table, video watermark, analytics viewer chips). This is mainly useful
for Google sign-ins where no name came through and the account is stuck
showing "Student" — new Google sign-ups now default to a name derived
from their email instead, but existing accounts created before that
change need a manual fix here.

This only works if you've completed the `adminUid` field in Step 4 and
re-published the current `firestore.rules` — the rules only allow the
one hidden admin account to update the `name` field, nothing else, and
only on other users' docs.

## Video analytics (admin)

The admin panel's **Video Analytics** tab shows, for every video, how many
times it's been purchased/unlocked and the username of every viewer who
unlocked it — pulled from the same `unlocks` records used elsewhere, so no
extra setup is needed.

## Dictionary page

A **Dictionary** link now sits in the navbar (and hamburger menu) next to
Dashboard. Students can search any English word and see:
- Its definitions, grouped by part of speech, with example sentences
- Its Arabic meaning
- British 🇬🇧 and American 🇺🇸 pronunciation, with a play button for audio
  where it's available

**On data sources — please read this:** this is *not* actually the Cambridge
Dictionary. Cambridge's own dictionary API is real, but access is gated
behind a developer key you'd need to apply for directly with Cambridge
(https://dictionary-api.cambridge.org/apply), and likely a commercial
license for a site with real users — it isn't something that can be wired
up for free. Scraping Cambridge's website directly isn't done here either,
since that would violate their Terms of Service and could break at any
time. Instead, the Dictionary page uses two free, keyless, publicly
documented APIs that together produce the same result:

- **Free Dictionary API** (`api.dictionaryapi.dev`) for definitions,
  parts of speech, example sentences, and UK/US audio pronunciation.
- **MyMemory Translation API** (`api.mymemory.translated.net`) for the
  Arabic translation.

Both are called directly from the student's browser — no API key, no
backend, no extra Firebase setup needed. If you later get approved for
real Cambridge API access and want the site to use Cambridge's own data
instead, the lookup logic is isolated in `js/dictionary.js` and can be
swapped over.

## Hardening the backend (optional, for later)

Video/code creation now goes through a real signed-in Firebase Auth session
(the hidden admin account from Step B), so Firestore's security rules
already enforce that only a signed-in user can write — this closes the
biggest gap from earlier versions of this setup.

The remaining trade-off: any *signed-in* user (including normal students,
not just admin) technically has write access to `/videos` and `/codes` at
the database-rule level, because there's no way to mark "this specific
account is admin" without a backend. In practice a student would need to
open browser dev tools and manually call the Firestore API to exploit this
— not something a casual user would do, but not impossible either.

If you later want it fully locked down so ONLY the admin account can write:
1. Add Firebase Cloud Functions (still free tier eligible for light use).
2. Set a custom claim (e.g. `admin: true`) on your hidden admin account.
3. Update `firestore.rules` so `/videos` and `/codes` writes require
   `request.auth.token.admin == true` instead of just `request.auth != null`.

This isn't required to launch — it's a "nice to have" once the business
grows.

## Costs

Firebase Spark (free) plan limits, as of writing:
- Authentication: unlimited users, free
- Firestore: 50,000 reads/day, 20,000 writes/day, 1GB storage — free
- No credit card required, no trial expiration

A course site with a few hundred students checking in daily will comfortably
stay within these free limits.
