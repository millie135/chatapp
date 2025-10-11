"use client";

import { useState, useEffect } from "react";
import SignUp from "@/components/SignUp";
import SignIn from "@/components/SignIn";
import ChatBox from "@/components/ChatBox";
import { auth, db, rtdb } from "@/firebaseConfig";
import { collection, onSnapshot, query, orderBy, getDocs, updateDoc, doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { ref, set as rtdbSet, onDisconnect, onValue } from "firebase/database";

export default function Home() {
  const [showSignUp, setShowSignUp] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [chatUser, setChatUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [unreadCounts, setUnreadCounts] = useState<{ [key: string]: number }>({});
  const [userStatuses, setUserStatuses] = useState<{ [key: string]: boolean }>({}); // Track online/offline

  // Auth state
  /*useEffect(() => {
    // Listen to auth state
    const unsubscribe = auth.onAuthStateChanged((u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);*/

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (u) => {
      if (u) {
        // Fetch role
        const userRef = doc(db, "users", u.uid);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.data();
        setUser({ ...u, role: userData?.role || "user", username: userData?.username });
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);


  useEffect(() => {
    if (!user) return;

    const userRef = doc(db, "users", user.uid);
    const statusRef = ref(rtdb, `/status/${user.uid}`);
    const connectedRef = ref(rtdb, ".info/connected");

    // Update Firestore info (async handled safely)
    //setDoc(userRef, { email: user.email, avatar: user.photoURL || "" }, { merge: true });
    // Only set avatar if it doesn't exist
    setDoc(userRef, {
      email: user.email,
      avatar: (user.photoURL || `https://avatars.dicebear.com/api/identicon/${user.uid}.svg`)
    }, { merge: true });


    // Listen to connection state
    const unsubscribeConnected = onValue(connectedRef, (snap) => {
      if (snap.val() === true) {
        rtdbSet(statusRef, true); // mark online
        onDisconnect(statusRef)
          .set(false)
          .then(() => updateDoc(userRef, { lastSeen: serverTimestamp() }));
      }
    });

    return () => unsubscribeConnected();
  }, [user]);

  // Fetch users
  /*useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(collection(db, "users"), (snapshot) => {
      const allUsers = snapshot.docs
        .filter((doc) => doc.id !== user.uid)
        .map((doc) => ({ id: doc.id, ...doc.data() }));
      setUsers(allUsers);
    });
    return () => unsubscribe();
  }, [user]);*/
  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(collection(db, "users"), (snapshot) => {
      let allUsers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      if (user.role !== "manager") {
        allUsers = allUsers.filter((u) => u.id !== user.uid);
      }
      setUsers(allUsers);
    });
    return () => unsubscribe();
  }, [user]);

 // --- Listen to all users' online statuses ---
  useEffect(() => {
    if (!users.length) return;
    const unsubscribers: (() => void)[] = [];

    users.forEach((u) => {
      const statusRef = ref(rtdb, `/status/${u.id}`);
      const unsubscribe = onValue(statusRef, (snapshot) => {
        //const isOnline = snapshot.val() === true; // null or false → offline
        //setUserStatuses((prev) => ({ ...prev, [u.id]: isOnline }));
        setUserStatuses(prev => ({ ...prev, [u.id]: snapshot.val() === true }));
      });
      unsubscribers.push(unsubscribe);
    });

    return () => unsubscribers.forEach((fn) => fn());
  }, [users]);

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
    setUnreadCounts(prev => ({ ...prev, [u.id]: 0 }));
    if (!user) return;
    const snapshot = await getDocs(query(collection(db, "chats", u.id, user.uid), orderBy("timestamp")));
    snapshot.docs.forEach(async (docSnap) => {
      const data = docSnap.data() as any;
      if (!data.read && data.senderId === u.id) {
        await updateDoc(doc(db, "chats", u.id, user.uid, docSnap.id), { read: true });
      }
    });
    //setUnreadCounts((prev) => ({ ...prev, [u.id]: 0 }));
  };

  const handleSignOut = async () => {
    if (!user) return;

    const statusRef = ref(rtdb, `/status/${user.uid}`);
    await rtdbSet(statusRef, false); // immediately offline
    await updateDoc(doc(db, "users", user.uid), { lastSeen: serverTimestamp() });
    await auth.signOut();
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
          <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-100">Welcome, {user.email}{" "}
            <span className="text-sm text-gray-500">({user.role})</span>
          </h2>
          <button
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition mb-4"
            onClick={handleSignOut}
          >
            Sign Out
          </button>

          {/* Only show all users for manager */}
          <div className="space-y-2">
            {users.map((u) => (
              <button
                key={u.id}
                className={`relative block w-full text-left px-2 py-1 rounded ${
                  chatUser?.id === u.id ? "bg-blue-500 text-white" : "hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
                onClick={() => handleSelectUser(u)}
              >
                <div className="flex justify-between items-center">
                  <span>{u.username}</span>
                  <span className={`text-xs font-medium ${userStatuses[u.id] ? "text-green-500" : "text-gray-400"}`}>
                    {userStatuses[u.id] ? "Online" : "Offline"}
                  </span>
                </div>
                {unreadCounts[u.id] > 0 && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {unreadCounts[u.id]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 p-4">
          {chatUser ? (
            /*<ChatBox
              key={chatUser.id}
              chatWithUserId={chatUser.id}
              chatWithUsername={chatUser.username}
              onReadMessages={() => setUnreadCounts(prev => ({ ...prev, [chatUser.id]: 0 }))}
              //online={chatUser ? userStatuses[chatUser.id] : false}
            />*/
            <ChatBox
              key={chatUser.id}
              chatWithUserId={chatUser.id}             // target user
              chatWithUsername={chatUser.username}
              onReadMessages={() => setUnreadCounts(prev => ({ ...prev, [chatUser.id]: 0 }))}
              isManager={user.role === "manager"}
              currentUserId={user.uid}                 // manager's own uid
              managerViewUserId={chatUser.id}          // the user being viewed
            />

          ) : (
            <p className="text-gray-500 dark:text-gray-400">Select a user to start chatting</p>
          )}
        </div>
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
