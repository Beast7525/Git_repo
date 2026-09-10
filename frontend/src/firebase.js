// src/firebase.js

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCoxe-bk_zVI1d29wrsAdGbbt9I3Y8xBcs",
  authDomain: "login-5430c.firebaseapp.com",
  projectId: "login-5430c",
  storageBucket: "login-5430c.firebasestorage.app",
  messagingSenderId: "988670257940",
  appId: "1:988670257940:web:77ee9e495519534f583001",
  measurementId: "G-TFMK8EPC50",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication
export const auth = getAuth(app);

export default app;