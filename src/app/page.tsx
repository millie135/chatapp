"use client";

import { useState, useEffect } from "react";
import SignUp from "@/components/SignUp";
import SignIn from "@/components/SignIn";
import ChatBox from "@/components/ChatBox";
import { auth, db, rtdb } from "@/firebaseConfig";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  getDoc,
  doc,
  setDoc,
  serverTimestamp,
  updateDoc,
  where,
  getDocs,
} from "firebase/firestore";
import { ref, set as rtdbSet, onDisconnect, onValue } from "firebase/database";

export default function Home() {
  const [showSignUp, setShowSignUp] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [chatUser, setChatUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [userStatuses, setUserStatuses] = useState<{ [key: string]: boolean }>({});
  const [unreadCounts, setUnreadCounts] = useState<{ [key: string]: number }>({});

  // 🔹 Listen to auth state
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (u) => {
      if (u) {
        const userRef = doc(db, "users", u.uid);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.data();
        setUser({ ...u, username: userData?.username || u.email });
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 🔹 Track online/offline
  useEffect(() => {
    if (!user) return;

    const userRef = doc(db, "users", user.uid);
    const statusRef = ref(rtdb, `/status/${user.uid}`);
    const connectedRef = ref(rtdb, ".info/connected");

    setDoc(
      userRef,
      {
        email: user.email,
        avatar: user.photoURL || `https://avatars.dicebear.com/api/identicon/${user.uid}.svg`,
      },
      { merge: true }
    );

    const unsubscribeConnected = onValue(connectedRef, (snap) => {
      if (snap.val() === true) {
        rtdbSet(statusRef, true);
        onDisconnect(statusRef)
          .set(false)
          .then(() => updateDoc(userRef, { lastSeen: serverTimestamp() }));
      }
    });

    return () => unsubscribeConnected();
  }, [user]);

  // 🔹 Fetch all users except current
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

  // 🔹 Track users' online status (RTDB)
  useEffect(() => {
    if (!users.length) return;
    const unsubscribers: (() => void)[] = [];

    users.forEach((u) => {
      const statusRef = ref(rtdb, `/status/${u.id}`);
      const unsubscribe = onValue(statusRef, (snapshot) => {
        setUserStatuses((prev) => ({ ...prev, [u.id]: snapshot.val() === true }));
      });
      unsubscribers.push(unsubscribe);
    });

    return () => unsubscribers.forEach((fn) => fn());
  }, [users]);

  // 🔹 Unread message listener + new message alert
  useEffect(() => {
    if (!user || !users.length) return;

    const unsubscribers: (() => void)[] = [];

    users.forEach((u) => {
      const messagesRef = collection(db, "chats", user.uid, u.id);
      const q = query(messagesRef, orderBy("timestamp", "desc"));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        let unread = 0;
        let latest: any = null;

        snapshot.docChanges().forEach((change) => {
          const data = change.doc.data() as any;

          if (change.type === "added" && data.senderId === u.id && !data.read) {
            unread++;
            latest = data;
          }
        });

        if (unread > 0 && latest) {
          // 🔔 Optional: play sound for new incoming message
          const audio = new Audio("/notify.mp3");
          audio.play().catch(() => {});

          // update unread count
          setUnreadCounts((prev) => ({
            ...prev,
            [u.id]: (prev[u.id] || 0) + unread,
          }));
        } else {
          // recalc total unread count on full snapshot
          const totalUnread = snapshot.docs.filter(
            (doc) => doc.data().senderId === u.id && !doc.data().read
          ).length;

          setUnreadCounts((prev) => ({ ...prev, [u.id]: totalUnread }));
        }
      });

      unsubscribers.push(unsubscribe);
    });

    return () => unsubscribers.forEach((fn) => fn());
  }, [users, user]);

  // 🔹 Mark messages as read when user opens a chat
  const handleSelectUser = async (u: any) => {
    setChatUser(u);

    // reset unread count immediately
    setUnreadCounts((prev) => ({ ...prev, [u.id]: 0 }));

    // mark all unread messages as read
    const q = query(
      collection(db, "chats", user.uid, u.id),
      where("read", "==", false)
    );
    const snapshot = await getDocs(q);
    const updates = snapshot.docs.map((docSnap) => updateDoc(docSnap.ref, { read: true }));
    await Promise.all(updates);
  };

  // 🔹 Sign out
  const handleSignOut = async () => {
    if (!user) return;

    const statusRef = ref(rtdb, `/status/${user.uid}`);
    await rtdbSet(statusRef, false);
    await updateDoc(doc(db, "users", user.uid), { lastSeen: serverTimestamp() });
    await auth.signOut();
  };

  // 🔹 Loading state
  if (loading)
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-600 dark:text-gray-300 text-lg animate-pulse">Loading...</p>
      </div>
    );

  // 🔹 Logged in
  if (user)
    return (
      <div className="flex flex-col md:flex-row min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Sidebar - Users list */}
        <div className="w-full md:w-1/4 p-4 bg-white dark:bg-gray-800 shadow-md rounded-md">
          <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-100">
            Welcome, {user.username}
          </h2>
          <button
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition mb-4"
            onClick={handleSignOut}
          >
            Sign Out
          </button>

          <div className="space-y-2">
            {users.map((u) => (
              <button
                key={u.id}
                className={`relative block w-full text-left px-2 py-1 rounded ${
                  chatUser?.id === u.id
                    ? "bg-blue-500 text-white"
                    : "hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
                onClick={() => handleSelectUser(u)}
              >
                <div className="flex justify-between items-center">
                  <span>{u.username}</span>
                  <span
                    className={`text-xs font-medium ${
                      userStatuses[u.id] ? "text-green-500" : "text-gray-400"
                    }`}
                  >
                    {userStatuses[u.id] ? "Online" : "Offline"}
                  </span>
                </div>

                {/* 🔹 Unread badge */}
                {unreadCounts[u.id] > 0 && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {unreadCounts[u.id]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Chat box */}
        <div className="flex-1 p-4">
          {chatUser ? (
            <ChatBox
              key={chatUser.id}
              chatWithUserId={chatUser.id}
              chatWithUsername={chatUser.username}
              currentUserId={user.uid}
            />
          ) : (
            <p className="text-gray-500 dark:text-gray-400">
              Select a user to start chatting
            </p>
          )}
        </div>
      </div>
    );

  // 🔹 Not signed in
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 space-y-6 px-4">
      <div className="w-full max-w-md">
        {showSignUp ? <SignUp /> : <SignIn />}
      </div>
      <button
        className="text-blue-600 dark:text-blue-400 hover:underline"
        onClick={() => setShowSignUp(!showSignUp)}
      >
        {showSignUp
          ? "Already have an account? Sign In"
          : "Don't have an account? Sign Up"}
      </button>
    </div>
  );
}
