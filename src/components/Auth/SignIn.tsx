"use client";

import { useState } from "react";
import { auth, db } from "@/firebaseConfig";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { v4 as uuidv4 } from "uuid";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) throw new Error("User not found in database");
      const data = userSnap.data();

      // 1️⃣ Create local session
      let localSessionId = localStorage.getItem("sessionId");
      if (!localSessionId) {
        localSessionId = uuidv4();
        localStorage.setItem("sessionId", localSessionId);
      }

      // 2️⃣ Block login if another session exists
      if (data?.sessionId && data.sessionId !== localSessionId) {
        await auth.signOut();
        setError("Your account is already logged in on another device.");
        return;
      }

      // 3️⃣ Update Firestore session
      await updateDoc(userRef, { sessionId: localSessionId, lastSeen: serverTimestamp() });
      sessionStorage.setItem("sessionId", localSessionId);

    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white shadow rounded-md">
      <h2 className="text-2xl font-bold mb-4 text-center">Sign In</h2>
      {error && <p className="text-red-500 mb-2">{error}</p>}
      <form onSubmit={handleSignIn} className="space-y-4">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded"
          required
        />
        <button
          type="submit"
          className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 transition"
        >
          Sign In
        </button>
      </form>
    </div>
  );
}
