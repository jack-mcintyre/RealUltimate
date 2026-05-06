/**
 * Expo merges this file with app.json. Firebase settings here are bundled into the APK/AAB;
 * use EAS Environment Variables (EXPO_PUBLIC_FIREBASE_*) to override per build profile
 * without committing keys — Google Cloud Console App Check + Android package SHA restrictions
 * remain important since client keys are always recoverable from binaries.
 */
const DEFAULT_FIREBASE = require("./firebase.defaults.js");

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    firebase: {
      apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || DEFAULT_FIREBASE.apiKey,
      authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || DEFAULT_FIREBASE.authDomain,
      databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL || DEFAULT_FIREBASE.databaseURL,
      projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || DEFAULT_FIREBASE.projectId,
      storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || DEFAULT_FIREBASE.storageBucket,
      messagingSenderId:
        process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || DEFAULT_FIREBASE.messagingSenderId,
      appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || DEFAULT_FIREBASE.appId,
      measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID || DEFAULT_FIREBASE.measurementId,
    },
  },
});
