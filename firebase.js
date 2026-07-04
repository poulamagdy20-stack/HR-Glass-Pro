import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-storage.js";

export const firebaseConfig = {
  apiKey: "AIzaSyAQ9CaQuXMcCVAMssq19sjXWBC8W-UiAUs",
  authDomain: "hr--pro.firebaseapp.com",
  projectId: "hr--pro",
  storageBucket: "hr--pro.firebasestorage.app",
  messagingSenderId: "956137661295",
  appId: "1:956137661295:web:f4dba0606e3b5a4786be9a",
  measurementId: "G-LTNQV2VTF8"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const COMPANY_ID = "main";
