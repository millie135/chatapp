// utils/auth.ts
import { auth, db, rtdb } from "@/firebaseConfig";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { ref as rtdbRef, set as rtdbSet } from "firebase/database";

export const signOutUser = async (userId: string) => {
  try {
    // Update Realtime DB status
    const statusRef = rtdbRef(rtdb, `/status/${userId}`);
    await rtdbSet(statusRef, false);

    // Update Firestore user document
    const userRef = doc(db, "users", userId);
    await updateDoc(userRef, {
      sessionId: null,
      lastSeen: serverTimestamp(),
    });

    // Clear local storage
    localStorage.removeItem("sessionId");

    // Sign out
    await auth.signOut();
  } catch (err) {
    console.error("Error signing out:", err);
    throw err;
  }
};
