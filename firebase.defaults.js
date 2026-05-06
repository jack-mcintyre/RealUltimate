/**
 * Single source for Firebase web/client defaults (dev + fallback when Expo `extra` is missing).
 * app.config.js merges env overrides at build time; firebaseConfig uses this if `extra.firebase` is unavailable.
 */
module.exports = {
  apiKey: "AIzaSyDkyAIfXXMRpsGbZ0idU7Out6N7rZI_93E",
  authDomain: "realultimate-62638.firebaseapp.com",
  databaseURL: "https://realultimate-62638-default-rtdb.firebaseio.com",
  projectId: "realultimate-62638",
  storageBucket: "realultimate-62638.firebasestorage.app",
  messagingSenderId: "926825574682",
  appId: "1:926825574682:web:cb000661a4bb055d35bca3",
  measurementId: "G-ZM7R0J2CWZ",
};
