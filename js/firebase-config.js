/* ===========================================================
   Easy English — Firebase Configuration
   -----------------------------------------------------------
   1. Go to https://console.firebase.google.com
   2. Create a project (free "Spark" plan)
   3. Add a Web App inside it (</> icon)
   4. Copy the config object it gives you and paste the values below
   5. Enable "Authentication" -> Sign-in method -> Email/Password
   6. Enable "Firestore Database" -> Start in production mode
   7. Paste the rules from firestore.rules into the Firestore "Rules" tab
   =========================================================== */

const firebaseConfig = {
  apiKey: "AIzaSyAXiG2xjB17cvFdvx-RqeNyDzen9eHP1Kk",
  authDomain: "easyenglish-9f67b.firebaseapp.com",
  projectId: "easyenglish-9f67b",
  storageBucket: "easyenglish-9f67b.firebasestorage.app",
  messagingSenderId: "132507711119",
  appId: "1:132507711119:web:a3bb81bea74ec31ba562fa"
};

// Initialize Firebase (compat SDKs are loaded via <script> tags in each HTML page)
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
