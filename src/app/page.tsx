"use client";

import { useState, useEffect, useRef } from "react";
import SignUp from "@/components/Auth/SignUp";
import SignIn from "@/components/Auth/SignIn";
import ChatBox from "@/components/Chat/ChatBox";
import UserList from "@/components/Chat/UserList";
import GroupList from "@/components/Chat/GroupList";
import AddMemberModal from "@/components/Modals/AddMemberModal";
import CreateGroupModal from "@/components/Modals/CreateGroupModal";

import { UserType, Group } from "@/types";
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
  arrayUnion,
  addDoc,
  runTransaction,
} from "firebase/firestore";
import { ref, set as rtdbSet, onDisconnect, onValue } from "firebase/database";

export default function Home() {
  const [showSignUp, setShowSignUp] = useState(true);
  const [user, setUser] = useState<UserType | null>(null);
  const [users, setUsers] = useState<UserType[]>([]);
  const [chatUser, setChatUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [userStatuses, setUserStatuses] = useState<{ [key: string]: boolean }>({});
  const [unreadCounts, setUnreadCounts] = useState<{ [key: string]: number }>({});
  const prevUnreadCounts = useRef<{ [key: string]: number }>({});
  const [groups, setGroups] = useState<Group[]>([]);

  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  const notificationAudio = useRef<HTMLAudioElement | null>(null);
  const unsubscribersRef = useRef<(() => void)[]>([]);
  const sessionIdRef = useRef<string | null>(null);

  // -------------------
  // Firebase: Auth State + Single Session
  // -------------------
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (u) => {
      if (!u) {
        setUser(null);
        setLoading(false);
        return;
      }
      

      try {
        
        const userRef = doc(db, "users", u.uid);
        await runTransaction(db, async (transaction) => {
          const userSnap = await transaction.get(userRef);

          let localSessionId = localStorage.getItem("sessionId");
          if (!localSessionId) {
            localSessionId = crypto.randomUUID();
            localStorage.setItem("sessionId", localSessionId);
          }

          // If user exists
          if (userSnap.exists()) {
            const data = userSnap.data();
            // Block login if another device exists
            if (data?.sessionId && data.sessionId !== "" && data.sessionId !== localSessionId) {
              throw new Error("Your account is already logged in on another device.");
            }
            // Atomically set sessionId
            transaction.update(userRef, { sessionId: localSessionId });
          } else {
            // New user: create document
            transaction.set(userRef, { sessionId: localSessionId, createdAt: serverTimestamp() });
          }

          sessionIdRef.current = localSessionId;
        });

        // -------------------
        // Get custom claims for role
        // -------------------
        const tokenResult = await u.getIdTokenResult();
        const roleFromToken = (tokenResult.claims.role as string) || "user";

        const userSnap = await getDoc(userRef);
        const data = userSnap.data();

        setUser({
          id: u.uid,
          uid: u.uid,
          username: data?.username || u.email?.split("@")[0] || "User",
          avatar: data?.avatar || `https://avatars.dicebear.com/api/identicon/${u.uid}.svg`,
          email: data?.email || undefined,
          role: data?.role || "user",
          //role: roleFromToken,
        });
      } catch (err: any) {
        alert(err.message);
        await auth.signOut();
        setUser(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // -------------------
  // Real-time logout if sessionId changes
  // -------------------
  useEffect(() => {
  if (!user) return;

  const userRef = doc(db, "users", user.uid);
  const unsubscribe = onSnapshot(userRef, (snap) => {
    const data = snap.data();
    if (!data) return;

    // Only trigger if sessionId changed AND user is not manually logging out
    if (data.sessionId && data.sessionId !== sessionIdRef.current) {
      if (!isManualLogout.current) {
        alert(
          "You have been logged out because your account was signed in on another device."
        );
      }
      auth.signOut();
      localStorage.removeItem("sessionId");
      sessionIdRef.current = null;
      setUser(null);
    }
  });

  return () => unsubscribe();
}, [user]);



  // -------------------
  // Fetch Users & Groups
  // -------------------
  useEffect(() => {
    if (!user) return;

    const unsubUsers = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const allUsers = snapshot.docs
          .filter((doc) => doc.id !== user.uid)
          .map((doc) => ({
            id: doc.id,
            uid: doc.id,
            username: doc.data().username,
            email: doc.data().email,
            avatar: doc.data().avatar,
            role: doc.data().role,
          }));
        setUsers(allUsers);
      },
      (error) => console.error("Error fetching users:", error)
    );

    let unsubGroups: () => void;
    const groupsRef = collection(db, "groups");

    if (user.role === "Leader") {
      unsubGroups = onSnapshot(
        groupsRef,
        (snapshot) => {
          const allGroups = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Group));
          setGroups(allGroups);
        },
        (error) => console.error("Error fetching groups:", error)
      );
    } else {
      const q = query(groupsRef, where("members", "array-contains", user.uid));
      unsubGroups = onSnapshot(
        q,
        (snapshot) => {
          const userGroups = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Group));
          setGroups(userGroups);
        },
        (error) => console.error("Error fetching groups:", error)
      );
    }

    return () => {
      unsubUsers();
      unsubGroups && unsubGroups();
    };
  }, [user]);

  // -------------------
  // Track Online Status
  // -------------------
  useEffect(() => {
    if (!user) return;

    const connectedRef = ref(rtdb, ".info/connected");
    const userStatusRef = ref(rtdb, `/status/${user.uid}`);

    const updateUserProfile = async () => {
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.data();

      await setDoc(
        userRef,
        {
          email: user.email,
          username: userData?.username || user.username,
          avatar: userData?.avatar || user.avatar,
        },
        { merge: true }
      );
    };
    updateUserProfile();

    const unsubscribe = onValue(connectedRef, (snap) => {
      if (!snap.val()) return;
      onDisconnect(userStatusRef).set(false).then(() => rtdbSet(userStatusRef, true));
    });

    return () => unsubscribe();
  }, [user]);

  // -------------------
  // Track Other Users' Online Status
  // -------------------
  useEffect(() => {
    if (!users.length) return;
    const unsubscribers: (() => void)[] = [];

    users.forEach((u) => {
      const statusRef = ref(rtdb, `/status/${u.id}`);
      const unsubscribe = onValue(statusRef, (snap) => {
        setUserStatuses((prev) => ({ ...prev, [u.id]: snap.val() === true }));
      });
      unsubscribers.push(unsubscribe);
    });

    return () => unsubscribers.forEach((fn) => fn());
  }, [users]);

  // -------------------
  // Track Unread Messages
  // -------------------
  useEffect(() => {
    if (!user || !users.length) return;
    const unsubscribers: (() => void)[] = [];

    users.forEach((u) => {
      const messagesRef = collection(db, "chats", user.uid, u.id);
      const q = query(messagesRef, orderBy("timestamp", "desc"));

      const unsubscribe = onSnapshot(q, async (snapshot) => {
        const unreadDocs = snapshot.docs.filter(
          (doc) => doc.data().senderId === u.id && !doc.data().read
        );

        if (chatUser?.id === u.id && unreadDocs.length > 0) {
          const updates = unreadDocs.map((docSnap) => updateDoc(docSnap.ref, { read: true }));
          await Promise.all(updates);
        }

        const unreadCount = chatUser?.id === u.id ? 0 : unreadDocs.length;

        setUnreadCounts((prev) => ({ ...prev, [u.id]: unreadCount }));

        if (unreadCount > (prevUnreadCounts.current[u.id] || 0) && chatUser?.id !== u.id) {
          notificationAudio.current?.play().catch(() => {});
        }
        prevUnreadCounts.current[u.id] = unreadCount;
      });

      unsubscribers.push(unsubscribe);
      unsubscribersRef.current.push(unsubscribe);
    });

    groups.forEach((g) => {
      const messagesRef = collection(db, "groupChats", g.id, "messages");
      const q = query(messagesRef, orderBy("timestamp", "desc"));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        let unreadCount = 0;
        snapshot.docs.forEach((doc) => {
          const msg = doc.data() as any;
          if (!msg.readBy?.[user.uid] && msg.senderId !== user.uid) unreadCount += 1;
        });

        setUnreadCounts((prev) => ({ ...prev, [g.id]: unreadCount }));

        if (unreadCount > (prevUnreadCounts.current[g.id] || 0) && chatUser?.id !== g.id) {
          const audio = new Audio("/notify.mp3");
          audio.play().catch(() => {});
        }
        prevUnreadCounts.current[g.id] = unreadCount;
      });

      unsubscribers.push(unsubscribe);
    });

    return () => unsubscribers.forEach((fn) => fn());
  }, [users, groups, user, chatUser]);

  // -------------------
  // Handlers
  // -------------------
  const handleSelectUser = async (u: UserType) => {
    if (chatUser?.id === u.id) return;

    setChatUser(u);
    setUnreadCounts((prev) => ({ ...prev, [u.id]: 0 }));

    const q = query(collection(db, "chats", user!.uid, u.id), where("read", "==", false));
    const snapshot = await getDocs(q);
    const updates = snapshot.docs.map((docSnap) => updateDoc(docSnap.ref, { read: true }));
    await Promise.all(updates);
  };

  const handleSelectGroup = async (g: Group) => {
    setChatUser({
      id: g.id,
      username: g.name,
      isGroup: true,
      members: g.members,
      avatar: g.avatar || `https://avatars.dicebear.com/api/identicon/${g.id}.svg`,
    });

    const messagesRef = collection(db, "groupChats", g.id, "messages");
    const q = query(messagesRef, where(`readBy.${user!.uid}`, "==", false));
    const snapshot = await getDocs(q);
    const updates = snapshot.docs.map((docSnap) =>
      updateDoc(docSnap.ref, { [`readBy.${user!.uid}`]: true })
    );
    await Promise.all(updates);

    setUnreadCounts((prev) => ({ ...prev, [g.id]: 0 }));
  };

  const isManualLogout = useRef(false);


  const handleSignOut = async () => {
  if (!user) return;

  try {
    isManualLogout.current = true; // set before updating anything

    // Set offline in RTDB
    const statusRef = ref(rtdb, `/status/${user.uid}`);
    await rtdbSet(statusRef, false);

    // Clear sessionId and lastSeen in Firestore
    const userRef = doc(db, "users", user.uid);
    await updateDoc(userRef, {
      sessionId: null,
      lastSeen: serverTimestamp(),
    });

    // Clear local storage
    localStorage.removeItem("sessionId");
    sessionIdRef.current = null;

    // Sign out from Firebase Auth
    await auth.signOut();

    // Reset manual logout flag
    isManualLogout.current = false;

    // Optional: clear user state immediately
    setUser(null);
  } catch (err) {
    console.error("Error signing out:", err);
  }
};




  const handleAddMember = async (memberId: string) => {
    if (!selectedGroup) return;
    const groupRef = doc(db, "groups", selectedGroup.id);
    try {
      await updateDoc(groupRef, { members: arrayUnion(memberId) });
      setShowAddMemberModal(false);
    } catch (err) {
      console.error("Failed to add member:", err);
    }
  };

  const handleCreateGroupSubmit = async (groupName: string, avatar: string) => {
    if (!user || user.role !== "Leader") return alert("Only leaders can create groups");
    if (!groupName.trim()) return;
    try {
      await addDoc(collection(db, "groups"), {
        name: groupName.trim(),
        members: [user.uid],
        avatar,
        createdAt: serverTimestamp(),
      });
      setNewGroupName("");
      setShowCreateGroupModal(false);
    } catch (err) {
      console.error(err);
      alert("Failed to create group.");
    }
  };

  // -------------------
  // Render
  // -------------------
  if (loading)
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-600 dark:text-gray-300 text-lg animate-pulse">Loading...</p>
      </div>
    );

  if (!user)
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 space-y-6 px-4">
        <div className="w-full max-w-md">{showSignUp ? <SignUp /> : <SignIn />}</div>
        <button
          className="text-blue-600 dark:text-blue-400 hover:underline"
          onClick={() => setShowSignUp(!showSignUp)}
        >
          {showSignUp ? "Already have an account? Sign In" : "Don't have an account? Sign Up"}
        </button>
      </div>
    );

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <div className="w-full md:w-1/4 p-4 bg-white dark:bg-gray-800 shadow-md rounded-md">
        <h2 className="flex items-center text-xl font-bold mb-4 text-gray-800 dark:text-gray-100 space-x-2">
          <img src={user.avatar} alt={user.username} className="w-10 h-10 rounded-full" />
          <span>Welcome, {user.username}</span>
        </h2>

        <button
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition mb-4"
          onClick={handleSignOut}
        >
          Sign Out
        </button>

        <UserList
          users={users}
          chatUser={chatUser}
          userStatuses={userStatuses}
          unreadCounts={unreadCounts}
          onSelectUser={handleSelectUser}
        />

        <GroupList
          groups={groups}
          onSelectGroup={handleSelectGroup}
          onOpenAddMember={(group) => setSelectedGroup(group)}
          onShowAddMemberModal={(show) => setShowAddMemberModal(show)}
          onShowCreateGroupModal={(show) => setShowCreateGroupModal(show)}
          groupUnreadCounts={unreadCounts}
          userRole={user?.role || ""}
        />
      </div>

      {/* Chat */}
      <div className="flex-1 p-4">
        {chatUser ? (
          <ChatBox
            key={chatUser.id}
            chatWithUserId={chatUser.id}
            chatWithUsername={chatUser.username}
            currentUserId={user.uid}
            isGroup={chatUser.isGroup || false}
            groupMembers={chatUser.members || []}
          />
        ) : (
          <p className="text-gray-500 dark:text-gray-400">
            Select a user or group to start chatting
          </p>
        )}
      </div>

      {/* Modals */}
      {showAddMemberModal && selectedGroup && (
        <AddMemberModal
          group={selectedGroup}
          users={users}
          onClose={() => setShowAddMemberModal(false)}
          onAddMember={handleAddMember}
        />
      )}

      {showCreateGroupModal && (
        <CreateGroupModal
          groupName={newGroupName}
          onChangeGroupName={setNewGroupName}
          onClose={() => setShowCreateGroupModal(false)}
          onSubmit={handleCreateGroupSubmit}
        />
      )}
    </div>
  );
}
