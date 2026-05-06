import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { initializeApp } from "firebase/app";
import { getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";
import { Platform } from 'react-native';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const DEFAULT_FIREBASE = require('./firebase.defaults.js');

/** Resolve `extra.firebase` — SDK / Metro sometimes expose config under manifest instead of expoConfig. */
function readFirebaseExtra() {
  const candidates = [
    Constants.expoConfig?.extra?.firebase,
    Constants.manifest?.extra?.firebase,
    Constants.manifest2?.extra?.expoClient?.extra?.firebase,
  ];
  for (const patch of candidates) {
    if (patch?.apiKey && patch?.databaseURL && patch?.projectId) {
      return patch;
    }
  }
  return null;
}

const fromExtra = readFirebaseExtra();

const firebaseConfig = {
  apiKey: fromExtra?.apiKey || DEFAULT_FIREBASE.apiKey,
  authDomain: fromExtra?.authDomain || DEFAULT_FIREBASE.authDomain,
  databaseURL: fromExtra?.databaseURL || DEFAULT_FIREBASE.databaseURL,
  projectId: fromExtra?.projectId || DEFAULT_FIREBASE.projectId,
  storageBucket: fromExtra?.storageBucket || DEFAULT_FIREBASE.storageBucket,
  messagingSenderId: fromExtra?.messagingSenderId || DEFAULT_FIREBASE.messagingSenderId,
  appId: fromExtra?.appId || DEFAULT_FIREBASE.appId,
  measurementId: fromExtra?.measurementId ?? DEFAULT_FIREBASE.measurementId,
};

if (!firebaseConfig.apiKey || !firebaseConfig.databaseURL || !firebaseConfig.projectId) {
  throw new Error(
    'Firebase client config is incomplete. Set values in firebase.defaults.js or EXPO_PUBLIC_FIREBASE_* environment variables.'
  );
}

const app = initializeApp(firebaseConfig);

const auth = Platform.OS === 'web'
  ? getAuth(app)
  : initializeAuth(app, {
      persistence: getReactNativePersistence(ReactNativeAsyncStorage)
    });

const db = getDatabase(app);
const storage = getStorage(app);

export { auth, db, storage };
