import { initializeApp } from "firebase/app";
// Import both 'getAuth' (for web) and 'initializeAuth' (for phone)
import { initializeAuth, getAuth, getReactNativePersistence } from 'firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { getDatabase } from "firebase/database";
// We use this to detect if we are on a phone or computer
import { Platform } from 'react-native';

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDkyAIfXXMRpsGbZ0idU7Out6N7rZI_93E",
  authDomain: "realultimate-62638.firebaseapp.com",
  databaseURL: "https://realultimate-62638-default-rtdb.firebaseio.com",
  projectId: "realultimate-62638",
  storageBucket: "realultimate-62638.firebasestorage.app",
  messagingSenderId: "926825574682",
  appId: "1:926825574682:web:cb000661a4bb055d35bca3",
  measurementId: "G-ZM7R0J2CWZ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Auth conditionally
let auth;

if (Platform.OS === 'web') {
  // If we are on the web (computer), use standard persistence
  auth = getAuth(app);
} else {
  // If we are on a phone (Android/iOS), use AsyncStorage
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage)
  });
}

const db = getDatabase(app);

export { auth, db };