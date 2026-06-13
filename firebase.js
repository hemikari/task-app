import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyClpjTfc4PTzDGP6E-hUED5e-aVvc-y7EY",
  authDomain: "task-app-hem.firebaseapp.com",
  projectId: "task-app-hem",
  storageBucket: "task-app-hem.firebasestorage.app",
  messagingSenderId: "328423280391",
  appId: "1:328423280391:web:3405a4795afe8917e2ffa2"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export async function loadUserData(uid) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : { projects: [], archive: [] };
}

export async function saveUserData(uid, data) {
  const ref = doc(db, "users", uid);
  await setDoc(ref, data);
}

export function loginWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export function logout() {
  return signOut(auth);
}

export { onAuthStateChanged };
