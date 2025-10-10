// src/firebaseConfig.ts
import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";



const firebaseConfig = {
  apiKey: "AIzaSyDUlZMDAq-PoANJfqpKZnEMjRhBnLJ9KMg",
  authDomain: "nextjschatapp-aef4d.firebaseapp.com",
  projectId: "nextjschatapp-aef4d",
  storageBucket: "nextjschatapp-aef4d.appspot.com",
  appId: "1:3625358905:web:55f5eba2f1182615805fe8",
  measurementId: "G-WWTRPFK661",
  databaseURL: "https://nextjschatapp-aef4d-default-rtdb.firebaseio.com" // Add this

};

const app = initializeApp(firebaseConfig);

//export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export const storage = getStorage(app); 

// Auth with persistence
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error("Failed to set auth persistence:", err);
});

