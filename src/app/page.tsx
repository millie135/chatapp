"use client";

import { useState, useEffect, useRef  } from "react";
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
  const prevUnreadCounts = useRef<{ [key: string]: number }>({});


  // 🔹 Listen to auth state
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (u) => {
      if (u) {
        const userRef = doc(db, "users", u.uid);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.data();
        setUser({ ...u, username: userData?.username || u.email, avatar: userData?.avatar || `https://avatars.dicebear.com/api/identicon/${u.uid}.svg` });
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Track online/offline
  useEffect(() => {
    if (!user) return;

    const userStatusRef = ref(rtdb, `/status/${user.uid}`);
    const connectedRef = ref(rtdb, ".info/connected");
    /*const userRef = doc(db, "users", user.uid);

    // Ensure user profile exists in Firestore
    setDoc(
      userRef,
      {
        email: user.email,
        username: user.displayName || user.email.split("@")[0],
        avatar:
          user.photoURL ||
          `https://avatars.dicebear.com/api/identicon/${user.uid}.svg`,
      },
      { merge: true }
    );*/


    const updateUserProfile = async () => {
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.data();

      // Only set default avatar if it does not exist
      await setDoc(
        userRef,
        {
          email: user.email,
          username: userData?.username || user.displayName || user.email.split("@")[0],
          avatar: userData?.avatar || user.avatar || `https://avatars.dicebear.com/api/identicon/${user.uid}.svg`,
        },
        { merge: true }
      );
    };

    updateUserProfile();

    const unsubscribe = onValue(connectedRef, (snapshot) => {
      if (snapshot.val() === false) return;

      // When client disconnects, mark offline
      onDisconnect(userStatusRef)
        .set(false)
        .then(() => {
          // When online, set true
          rtdbSet(userStatusRef, true);
        });
    });

    return () => unsubscribe();
  }, [user]);


  // Fetch all users except current
  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(collection(db, "users"), (snapshot) => {
      const allUsers = snapshot.docs
        .filter((doc) => doc.id !== user.uid)
        .map((doc) => ({
          id: doc.id,
          username: doc.data().username,
          email: doc.data().email,
          avatar: doc.data().avatar, // ✅ include avatar
          role: doc.data().role,
        }));
      setUsers(allUsers);
    });
    return () => unsubscribe();
  }, [user]);

  // Track users' online status (RTDB)
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

  // Unread message listener + new message alert
  useEffect(() => {
    if (!user || !users.length) return;

    const unsubscribers: (() => void)[] = [];

    users.forEach((u) => {
      const messagesRef = collection(db, "chats", user.uid, u.id);
      const q = query(messagesRef, orderBy("timestamp", "desc"));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        // Count unread messages from this user
        const unreadCount = snapshot.docs.filter(
          (doc) => doc.data().senderId === u.id && !doc.data().read
        ).length;

        setUnreadCounts((prev) => ({
          ...prev,
          [u.id]: unreadCount,
        }));

        // Optional: play sound only if new unread appears
        if (
          unreadCount > (prevUnreadCounts.current[u.id] || 0) &&
          chatUser?.id !== u.id // only alert if not chatting with them
        ) {
          const audio = new Audio("/notify.mp3");
          audio.play().catch(() => {});
        }

        // Track previous count for sound logic
        prevUnreadCounts.current[u.id] = unreadCount;
      });

      unsubscribers.push(unsubscribe);
    });

    return () => unsubscribers.forEach((fn) => fn());
  }, [users, user, chatUser]);


  // Mark messages as read when user opens a chat
  const handleSelectUser = async (u: any) => {
    if (chatUser?.id === u.id) return; // already open

    setChatUser(u);
    setUnreadCounts((prev) => ({ ...prev, [u.id]: 0 }));

    // 🔹 Mark unread messages as read
    const q = query(
      collection(db, "chats", user.uid, u.id),
      where("read", "==", false)
    );
    const snapshot = await getDocs(q);
    const updates = snapshot.docs.map((docSnap) =>
      updateDoc(docSnap.ref, { read: true })
    );
    await Promise.all(updates);
  };


  // Sign out
  const handleSignOut = async () => {
    if (!user) return;

    const statusRef = ref(rtdb, `/status/${user.uid}`);
    await rtdbSet(statusRef, false);
    await updateDoc(doc(db, "users", user.uid), { lastSeen: serverTimestamp() });
    await auth.signOut();
  };

  // Loading state
  if (loading)
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-600 dark:text-gray-300 text-lg animate-pulse">Loading...</p>
      </div>
    );

  // Logged in
  if (user)
    return (
      <div className="flex flex-col md:flex-row min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Sidebar - Users list */}
        <div className="w-full md:w-1/4 p-4 bg-white dark:bg-gray-800 shadow-md rounded-md">
          <h2 className="flex items-center text-xl font-bold mb-4 text-gray-800 dark:text-gray-100 space-x-2">
            <img
              src={user.avatar || `https://avatars.dicebear.com/api/identicon/${user.uid}.svg`}
              alt={user.username}
              className="w-10 h-10 rounded-full"
            />
            <span>Welcome, {user.username}</span>
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
                className={`flex items-center justify-between w-full px-3 py-2 rounded transition-colors ${
                  chatUser?.id === u.id
                    ? "bg-blue-500 text-white"
                    : "hover:bg-gray-100 dark:hover:bg-gray-700"
                }`}
                onClick={() => handleSelectUser(u)}
              >
                <div className="flex items-center space-x-2">
                  <img
                    src={u.avatar || `https://avatars.dicebear.com/api/identicon/${u.id}.svg`}
                    alt={u.username}
                    className="w-8 h-8 rounded-full"
                  />
                  <span className="font-medium">{u.username}</span>
                </div>

                <div className="flex items-center space-x-2">
                  {/* Online/Offline dot */}
                  <span
                    className={`w-3 h-3 rounded-full ${
                      userStatuses[u.id] ? "bg-green-500" : "bg-gray-400"
                    }`}
                    title={userStatuses[u.id] ? "Online" : "Offline"}
                  ></span>

                  {/* Unread badge */}
                  {unreadCounts[u.id] > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                      {unreadCounts[u.id]}
                    </span>
                  )}
                </div>
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

  // Not signed in
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
