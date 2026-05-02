import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from "firebase/app";
import { getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";
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

const auth = Platform.OS === 'web'
  ? getAuth(app)
  : initializeAuth(app, {
      persistence: getReactNativePersistence(ReactNativeAsyncStorage)
    });

const db = getDatabase(app);
const storage = getStorage(app);

export { auth, db, storage };
