// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, getDocs, writeBatch, serverTimestamp, onSnapshot, addDoc, query, where, orderBy, documentId, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
// All necessary storage functions, including deleteObject
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInAnonymously, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";


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

// Get references to the services you need and export them
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);


// Export specific Firebase functions for convenience, organized by service.
export const fb = {
    // Firestore
    doc, getDoc, setDoc, updateDoc, collection, getDocs, writeBatch, serverTimestamp, onSnapshot, addDoc, query, where, orderBy, documentId, deleteDoc,
    // Storage
    ref, uploadBytes, getDownloadURL, deleteObject,
    // Auth
    onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInAnonymously, signOut
};
