"use client";

import { useState } from "react";
import { auth, db, rtdb } from "@/firebaseConfig";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { ref as rtdbRef, set as rtdbSet } from "firebase/database";

export default function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [avatar, setAvatar] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      //const uid = userCredential.user.uid;

      const avatarUrl =
      avatar.trim() !== ""
        ? avatar.trim()
        : `https://avatars.dicebear.com/api/identicon/${user.uid}.svg`;

      // Save additional info in Firestore
      await setDoc(doc(db, "users", user.uid), {
        username: username,
        email,
        role: "user", // default role
        avatar: avatarUrl,
        createdAt: new Date()
      });

      // ------------------------
      // Set Realtime DB status immediately
      // ------------------------
      const statusRef = rtdbRef(rtdb, `/status/${user.uid}`);
      await rtdbSet(statusRef, "online"); // or true if you use boolean

      setSuccess("Account created successfully!");
      setEmail(""); setPassword(""); setUsername(""); setAvatar("");
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white shadow rounded-md">
      <h2 className="text-2xl font-bold mb-4 text-center">Sign Up</h2>
      {error && <p className="text-red-500 mb-2">{error}</p>}
      {success && <p className="text-green-500 mb-2">{success}</p>}
      <form onSubmit={handleSignUp} className="space-y-4">
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded"
          required
        />
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded"
          required
        />
        <input
          type="text"
          placeholder="Avatar URL"
          value={avatar}
          onChange={e => setAvatar(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded"
        />
        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
        >
          Sign Up
        </button>
      </form>
    </div>
  );
}

