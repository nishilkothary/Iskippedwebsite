import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDrI00uOoNLgAFrv92aRHPXQzPlzQkMvfo",
  authDomain: "iskip-54034.firebaseapp.com",
  databaseURL: "https://iskip-54034-default-rtdb.firebaseio.com",
  projectId: "iskip-54034",
  storageBucket: "iskip-54034.firebasestorage.app",
  messagingSenderId: "114335208267",
  appId: "1:114335208267:web:30460f02c629c8da7b8ece",
  measurementId: "G-TJVH6PBLDL",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export const auth = getAuth(app);
export default app;
