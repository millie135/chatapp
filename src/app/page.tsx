"use client";

import { useState, useEffect } from "react";
import SignUp from "@/components/SignUp";
import SignIn from "@/components/SignIn";
import ChatBox from "@/components/ChatBox";
import { auth, db, rtdb } from "@/firebaseConfig";
import { collection, onSnapshot, query, orderBy, getDocs, updateDoc, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { ref, set as rtdbSet, onDisconnect } from "firebase/database";

export default function Home() {
  const [showSignUp, setShowSignUp] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [chatUser, setChatUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [unreadCounts, setUnreadCounts] = useState<{ [key: string]: number }>({});

  // Auth state
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (u) => {
      setUser(u);
      setLoading(false);
      if (!u) return;

      const userRef = doc(db, "users", u.uid);
      await setDoc(
        userRef,
        {
          email: u.email,
          username: u.displayName || u.email,
          avatar: u.photoURL || "",
          online: true,
          lastSeen: serverTimestamp(),
        },
        { merge: true }
      );

      const statusRef = ref(rtdb, `/status/${u.uid}`);
      rtdbSet(statusRef, true);
      onDisconnect(statusRef).set(false);
    });
    return () => unsubscribe();
  }, []);

  // Fetch users
  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(collection(db, "users"), (snapshot) => {
      const allUsers = snapshot.docs
        .filter((doc) => doc.id !== user.uid)
        .map((doc) => ({ id: doc.id, ...doc.data() }));
      setUsers(allUsers);
    });
    return () => unsubscribe();
  }, [user]);

  // Track unread messages
  useEffect(() => {
    if (!user) return;
    const unsubscribers: (() => void)[] = [];
    users.forEach((u) => {
      const q = query(collection(db, "chats", u.id, user.uid), orderBy("timestamp"));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const unread = snapshot.docs.filter((doc) => {
          const data = doc.data() as any;
          return !data.read && data.senderId === u.id;
        }).length;
        setUnreadCounts((prev) => ({ ...prev, [u.id]: unread }));
      });
      unsubscribers.push(unsubscribe);
    });
    return () => unsubscribers.forEach((fn) => fn());
  }, [users, user]);

  const handleSelectUser = async (u: any) => {
    setChatUser(u);
    if (!user) return;
    const snapshot = await getDocs(query(collection(db, "chats", u.id, user.uid), orderBy("timestamp")));
    snapshot.docs.forEach(async (docSnap) => {
      const data = docSnap.data() as any;
      if (!data.read && data.senderId === u.id) {
        await updateDoc(doc(db, "chats", u.id, user.uid, docSnap.id), { read: true });
      }
    });
    setUnreadCounts((prev) => ({ ...prev, [u.id]: 0 }));
  };

  const handleSignOut = async () => {
    if (!user) return;

    const statusRef = ref(rtdb, `/status/${user.uid}`);
    const userRef = doc(db, "users", user.uid);

    try {
      // Cancel any existing onDisconnect
      onDisconnect(statusRef).cancel();

      // Set user offline in Realtime DB
      await rtdbSet(statusRef, false);

      // Update Firestore online status
      await updateDoc(userRef, {
        online: false,
        lastSeen: serverTimestamp(),
      });

      // Sign out
      await auth.signOut();

      console.log("Signed out successfully");
          setUser(null); // Make sure state updates immediately

    } catch (error) {
      console.error("Sign out error:", error);
    }
  };



  if (loading)
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-600 dark:text-gray-300 text-lg animate-pulse">Loading...</p>
      </div>
    );

  if (user)
    return (
      <div className="flex flex-col md:flex-row min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="w-full md:w-1/4 p-4 bg-white dark:bg-gray-800 shadow-md rounded-md">
          <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-100">Welcome, {user.email}</h2>
          <button className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition mb-4" onClick={() => auth.signOut()}>
            Sign Out
          </button>
          <div className="space-y-2">
            {users.map((u) => (
              <button
                key={u.id}
                className={`relative block w-full text-left px-2 py-1 rounded ${
                  chatUser?.id === u.id ? "bg-blue-500 text-white" : "hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
                onClick={() => handleSelectUser(u)}
              >
                {u.username || u.email}
                {unreadCounts[u.id] > 0 && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {unreadCounts[u.id]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 p-4">{chatUser ? <ChatBox key={chatUser.id} chatWithUserId={chatUser.id} chatWithUsername={chatUser.username} /> : <p className="text-gray-500 dark:text-gray-400">Select a user to start chatting</p>}</div>
      </div>
    );

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 space-y-6 px-4">
      <div className="w-full max-w-md">{showSignUp ? <SignUp /> : <SignIn />}</div>
      <button className="text-blue-600 dark:text-blue-400 hover:underline" onClick={() => setShowSignUp(!showSignUp)}>
        {showSignUp ? "Already have an account? Sign In" : "Don't have an account? Sign Up"}
      </button>
    </div>
  );
}
