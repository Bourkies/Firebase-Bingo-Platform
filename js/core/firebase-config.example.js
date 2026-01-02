// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, getDocs, writeBatch, serverTimestamp, onSnapshot, addDoc, query, where, orderBy, documentId, deleteDoc, arrayUnion, Timestamp, enableIndexedDbPersistence, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
// All necessary storage functions, including deleteObject
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject, connectStorageEmulator } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";
import { getAuth, onAuthStateChanged, signOut, updateProfile, signInWithEmailAndPassword, createUserWithEmailAndPassword, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";


// =================================================================
// TODO: 
// Create a copy and rename to firebase-config.js
// Replace the entire object below with the `firebaseConfig`
// object from your Firebase project's settings.

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// =================================================================

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const storage = getStorage(app);
const db = getFirestore(app);

// NEW: Connect to Emulators if on localhost (MUST happen before persistence)
if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    console.warn("⚠️ Using Firebase Emulators");
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectAuthEmulator(auth, "http://127.0.0.1:9099");
    connectStorageEmulator(storage, "127.0.0.1", 9199);
}

// NEW: Enable Offline Persistence (Cache)
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        console.warn('Persistence failed: Multiple tabs open.');
    } else if (err.code == 'unimplemented') {
        console.warn('Persistence not supported by browser.');
    }
});

// Get references to the services you need and export them
export { db, auth, storage };

// Export the Timestamp class separately for direct use in modules
export { Timestamp };

// Export specific Firebase functions for convenience, organized by service.
export const fb = {
    // Firestore
    doc, getDoc, setDoc, updateDoc, collection, getDocs, writeBatch, serverTimestamp, onSnapshot, addDoc, query, where, orderBy, documentId, deleteDoc, arrayUnion, Timestamp, enableIndexedDbPersistence,
    // Storage
    ref, uploadBytes, getDownloadURL, deleteObject,
    // Auth
    onAuthStateChanged, signOut, updateProfile, signInWithEmailAndPassword, createUserWithEmailAndPassword
};
