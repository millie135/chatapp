"use client";

import { useState, useEffect, useRef } from "react";
import SignUp from "@/components/Auth/SignUp";
import SignIn from "@/components/Auth/SignIn";
import ChatBox from "@/components/Chat/ChatBox";
import ManageMembersSidebar from "@/components/Chat/ManageMembersSidebar";
import AddMemberModal from "@/components/Modals/AddMemberModal";
import CreateGroupModal from "@/components/Modals/CreateGroupModal";
import TimeManagement, { TimeManagementHandle } from "@/components/Time/TimeManagement";
import { UserType, Group } from "@/types";
import { auth, db, rtdb } from "@/firebaseConfig";
import { signOutUser } from "@/utils/auth";
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
  QuerySnapshot,
  DocumentData,
  arrayRemove, 
} from "firebase/firestore";
import { ref, set as rtdbSet, onDisconnect, onValue } from "firebase/database";


export default function Home() {
  const [showSignUp, setShowSignUp] = useState(true);
  const [user, setUser] = useState<UserType | null>(null);
  const [users, setUsers] = useState<UserType[]>([]);
  const [chatUser, setChatUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  //const [userStatuses, setUserStatuses] = useState<{ [key: string]: boolean }>({});
  type StatusType = "online" | "onBreak" | "offline";

  const [userStatuses, setUserStatuses] = useState<{ [key: string]: StatusType }>({});

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
  const [showManageMembers, setShowManageMembers] = useState(false);
  const isManualLogout = useRef(false);
  const groupListenersRef = useRef<{ [groupId: string]: () => void }>({});
  // inside Home component
  const timeManagementRef = useRef<TimeManagementHandle>(null);

  // After user login (inside auth.onAuthStateChanged)
  //timeManagementRef.current?.autoCheckIn();
  useEffect(() => {
    timeManagementRef.current?.autoCheckIn();
  }, [user]);

  // -------------------
  // Firebase: Auth State + Single Session
  // -------------------
  useEffect(() => {
    // Safe UUID generator (works even if crypto.randomUUID is missing)
    function generateUUID(): string {
      if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
      }
      if (typeof crypto !== "undefined" && crypto.getRandomValues) {
        // Fallback RFC4122-like random string
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = crypto.getRandomValues(new Uint8Array(1))[0] % 16;
          const v = c === "x" ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
      }
      // Final fallback: basic random string
      return Math.random().toString(36).substring(2) + Date.now().toString(36);
    }

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
            localSessionId = generateUUID();
            localStorage.setItem("sessionId", localSessionId);
          }

          if (userSnap.exists()) {
            const data = userSnap.data();
            if (data?.sessionId && data.sessionId !== "" && data.sessionId !== localSessionId) {
              throw new Error("Your account is already logged in on another device.");
            }
            transaction.update(userRef, { sessionId: localSessionId });
          } else {
            transaction.set(userRef, { sessionId: localSessionId, createdAt: serverTimestamp() });
          }

          sessionIdRef.current = localSessionId;
        });

        const tokenResult = await u.getIdTokenResult();
        const roleFromToken = (tokenResult.claims.role as string) || "user";

        const userSnap = await getDoc(doc(db, "users", u.uid));
        const data = userSnap.data();

        setUser({
          id: u.uid,
          uid: u.uid,
          username: data?.username || u.email?.split("@")[0] || "User",
          avatar: data?.avatar || `https://avatars.dicebear.com/api/identicon/${u.uid}.svg`,
          email: data?.email || undefined,
          role: data?.role || roleFromToken || "user",
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

      if (data.sessionId && data.sessionId !== sessionIdRef.current) {
        if (!isManualLogout.current) {
          alert("You have been logged out because your account was signed in on another device.");
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

    // Clear old listeners
    unsubscribersRef.current.forEach((fn) => fn());
    unsubscribersRef.current = [];

    // --- Users ---
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
    unsubscribersRef.current.push(unsubUsers);

    // --- Groups ---
    const groupsRef = collection(db, "groups");
    const queryRef =
      user.role === "Leader" ? groupsRef : query(groupsRef, where("members", "array-contains", user.uid));

    const unsubGroups = onSnapshot(
      queryRef,
      (snapshot) => {
        const userGroups = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Group));

        const accessibleGroups = user.role === "Leader"
          ? userGroups
          : userGroups.filter((g) => g.members?.includes(user.uid));

        setGroups(accessibleGroups);

        // Deselect chat if current chat is removed
        if (chatUser?.isGroup && !accessibleGroups.find((g) => g.id === chatUser.id)) {
          setChatUser(null);
        }
      },
      (error: any) => {
        if (error.code === "permission-denied") {
          setGroups((prev) => {
            const filtered = prev.filter((g) => g.members?.includes(user.uid));
            if (chatUser?.isGroup && !filtered.find((g) => g.id === chatUser.id)) setChatUser(null);
            return filtered;
          });
        } else console.error("Error fetching groups:", error);
      }
    );
    unsubscribersRef.current.push(unsubGroups);

    return () => unsubscribersRef.current.forEach((fn) => fn());
  }, [user, chatUser]);


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
        //setUserStatuses((prev) => ({ ...prev, [u.id]: snap.val() === true }));
        // Previously: snap.val() === true
        setUserStatuses((prev) => ({ ...prev, [u.id]: snap.val() || "offline" }));
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
      // Unsubscribe previous listener if it exists
      if (groupListenersRef.current[g.id]) {
        groupListenersRef.current[g.id]();
        delete groupListenersRef.current[g.id];
      }

      // Only subscribe if user is a member
      if (!g.members?.includes(user.uid)) return;

      const messagesRef = collection(db, "groupChats", g.id, "messages");
      const q = query(messagesRef, orderBy("timestamp", "desc"));

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
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
        },
        (error: any) => {
          if (error.code === "permission-denied") {
            // Gracefully remove unread count and unsubscribe
            setUnreadCounts((prev) => {
              const newCounts = { ...prev };
              delete newCounts[g.id];
              return newCounts;
            });
            if (groupListenersRef.current[g.id]) {
              groupListenersRef.current[g.id]();
              delete groupListenersRef.current[g.id];
            }
          } else {
            console.error("Error fetching group messages:", error);
          }
        }
      );

      // Save listener for cleanup
      groupListenersRef.current[g.id] = unsubscribe;
    });

    //return () => unsubscribers.forEach((fn) => fn());
    return () => {
      unsubscribers.forEach((fn) => fn());
      Object.values(groupListenersRef.current).forEach((fn) => fn());
      groupListenersRef.current = {};
    };

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

  const handleSignOut = async () => {
    if (!user) return;

    try {
      await signOutUser(user.uid);
      setUser(null); // Update local state after logout
    } catch (err) {
      //console.error("Error signing out:", err);
      alert("Error signing out.");
    }
  };

  const handleAddMember = async (groupId: string, memberId: string) => {
    const groupRef = doc(db, "groups", groupId);
    await updateDoc(groupRef, {
      members: arrayUnion(memberId),
    });
  };

  const handleRemoveMember = async (groupId: string, memberId: string) => {
    const groupRef = doc(db, "groups", groupId);
    await updateDoc(groupRef, {
      members: arrayRemove(memberId),
    });
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
    <div className="flex min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-100">
      {/* === Left Sidebar === */}
      <aside className="flex-[2] border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col">
        {/* Profile + Sign out */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <img
              src={user.avatar}
              alt={user.username}
              className="w-10 h-10 rounded-full object-cover"
            />
            <div>
              <p className="font-semibold">{user.username}</p>
              <p className="text-xs text-gray-500">{user.role}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="text-sm px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded"
          >
            Sign out
          </button>
        </div>

        {/* Chat lists */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Private Chats */}
          <div>
            <h3 className="text-sm uppercase tracking-wide text-gray-500 mb-2">Private Chats</h3>
            <ul className="space-y-1">
              {users.map((u) => (
                <li
                  key={u.id}
                  className={`flex justify-between items-center px-3 py-2 rounded cursor-pointer transition ${
                    chatUser?.id === u.id
                      ? "bg-blue-100 dark:bg-blue-700"
                      : "hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                  onClick={() => handleSelectUser(u)}
                >
                  <div className="flex items-center space-x-2">
                    <img src={u.avatar} alt={u.username} className="w-8 h-8 rounded-full" />
                    <span>{u.username}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span
                      className={`inline-block w-3 h-3 rounded-full ${
                        userStatuses[u.id] === "online"
                          ? "bg-green-500"
                          : userStatuses[u.id] === "onBreak"
                          ? "bg-yellow-400"
                          : "bg-gray-400"
                      }`}
                    ></span>


                    {unreadCounts[u.id] > 0 && (
                      <span className="text-xs font-bold text-red-500">
                        {unreadCounts[u.id]}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Group Chats */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm uppercase tracking-wide text-gray-500">Group Chats</h3>
              {user.role === "Leader" && (
                <button
                  onClick={() => setShowCreateGroupModal(true)}
                  className="text-xs px-2 py-1 bg-green-500 hover:bg-green-600 text-white rounded"
                >
                  + New
                </button>
              )}
            </div>

            <ul className="space-y-1">
              {groups.map((g) => (
                <li
                  key={g.id}
                  className={`flex justify-between items-center px-3 py-2 rounded cursor-pointer transition ${
                    chatUser?.id === g.id
                      ? "bg-blue-100 dark:bg-blue-700"
                      : "hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                  onClick={() => handleSelectGroup(g)}
                >
                  <div className="flex items-center space-x-2">
                    <img
                      src={g.avatar || `https://api.dicebear.com/9.x/lorelei/svg?seed=${g.name}`}
                      alt={g.name}
                      className="w-8 h-8 rounded-full"
                    />
                    <span>{g.name}</span>
                  </div>

                  <div className="flex items-center space-x-1">
                    {unreadCounts[g.id] > 0 && (
                      <span className="text-xs font-bold text-red-500">
                        {unreadCounts[g.id]}
                      </span>
                    )}
                    {user.role === "Leader" && (
                      <button
                        className="text-xs px-2 py-0.5 bg-blue-500 text-white rounded hover:bg-blue-600"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedGroup(g);
                          setShowManageMembers(true);
                        }}
                      >
                        Manage
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>

      {/* === Chat Area === */}
      <main className="flex-[5] flex flex-col border-r border-gray-200 dark:border-gray-700">
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
          <div className="flex items-center justify-center flex-1 text-gray-500">
            Select a chat to start messaging
          </div>
        )}
      </main>

      {/* === Right Sidebar (free space) === */}
      <aside className="hidden md:flex flex-[5] bg-gray-50 dark:bg-gray-900 p-4">
        <TimeManagement userId={user.uid} ref={timeManagementRef} />
      </aside>

      {/* === Manage Members Modal (centered) === */}
      {showManageMembers && selectedGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Darker but clearer blur overlay */}
          <div
            className="absolute inset-0 bg-black/35 backdrop-blur-sm"
            onClick={() => setShowManageMembers(false)}
          />

          {/* Modal content */}
          <div className="relative bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg w-96 z-10">
            <ManageMembersSidebar
              group={selectedGroup}
              users={users}
              onAddMember={(memberId) => handleAddMember(selectedGroup.id, memberId)}
              onRemoveMember={(memberId) => handleRemoveMember(selectedGroup.id, memberId)}
              onClose={() => setShowManageMembers(false)}
            />
          </div>
        </div>
      )}

      {/* === Modals === */}
      {showCreateGroupModal && (
        <CreateGroupModal
          onClose={() => setShowCreateGroupModal(false)}
          onSubmit={handleCreateGroupSubmit}
        />
      )}

      {showAddMemberModal && selectedGroup && (
        <AddMemberModal
          group={selectedGroup}
          users={users}
          onAddMember={(memberId) => handleAddMember(selectedGroup.id, memberId)}
          onClose={() => setShowAddMemberModal(false)}
        />
      )}
    </div>
  );

}
