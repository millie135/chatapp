"use client";

import { useState, useEffect, useRef } from "react";
import SignUp from "@/components/Auth/SignUp";
import SignIn from "@/components/Auth/SignIn";
import ChatBox from "@/components/Chat/ChatBox";

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
} from "firebase/firestore";
import { ref, set as rtdbSet, onDisconnect, onValue } from "firebase/database";

interface Group {
  id: string;
  name: string;
  members: string[];
  avatar?: string;
}

interface UserType {
  id: string;
  uid: string;
  username: string;
  avatar: string;
  email?: string;
  role?: string;
}

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

  // Add Member Modal
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  const openAddMemberModal = (group: Group) => {
    setSelectedGroup(group);
    setShowAddMemberModal(true);
  };

  const handleAddMember = async (memberId: string) => {
    if (!selectedGroup) return;
    const groupRef = doc(db, "groups", selectedGroup.id);
    try {
      await updateDoc(groupRef, {
        members: arrayUnion(memberId),
      });
      setShowAddMemberModal(false);
    } catch (err) {
      console.error("Failed to add member:", err);
    }
  };

  const handleCreateGroupSubmit = async () => {
    if (!user || !newGroupName.trim()) return;

    try {
      await addDoc(collection(db, "groups"), {
        name: newGroupName.trim(),
        members: [user.uid],
        avatar: `https://api.dicebear.com/9.x/lorelei/svg?seed=${newGroupName.trim()}`,
        createdAt: serverTimestamp(),
      });
      setNewGroupName("");
      setShowCreateGroupModal(false);
    } catch (err) {
      console.error("Error creating group:", err);
      alert("Failed to create group. Check console for details.");
    }
  };



  // Fetch groups for current user
  useEffect(() => {
    if (!user) return;

    const unsubscribe = onSnapshot(collection(db, "groups"), (snapshot) => {
      const userGroups = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() } as Group))
        .filter((group) => group.members?.includes(user.uid));
      setGroups(userGroups);
    });

    return () => unsubscribe();
  }, [user]);

  // Listen to auth state
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (u) => {
      if (u) {
        const userRef = doc(db, "users", u.uid);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.data();

        setUser({
          id: u.uid,
          uid: u.uid,
          username: userData?.username || u.email?.split("@")[0] || "User",
          avatar: userData?.avatar || `https://avatars.dicebear.com/api/identicon/${u.uid}.svg`,
          email: u.email || undefined,
        });
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

    const unsubscribe = onValue(connectedRef, (snapshot) => {
      if (snapshot.val() === false) return;

      onDisconnect(userStatusRef)
        .set(false)
        .then(() => {
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
          uid: doc.id,
          username: doc.data().username,
          email: doc.data().email,
          avatar: doc.data().avatar,
          role: doc.data().role,
        }));
      setUsers(allUsers);
    });
    return () => unsubscribe();
  }, [user]);

  // Track users' online status
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

  // Unread messages listener
  useEffect(() => {
    if (!user || !users.length) return;
    const unsubscribers: (() => void)[] = [];

    users.forEach((u) => {
      const messagesRef = collection(db, "chats", user.uid, u.id);
      const q = query(messagesRef, orderBy("timestamp", "desc"));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const unreadCount = snapshot.docs.filter(
          (doc) => doc.data().senderId === u.id && !doc.data().read
        ).length;

        setUnreadCounts((prev) => ({ ...prev, [u.id]: unreadCount }));

        if (
          unreadCount > (prevUnreadCounts.current[u.id] || 0) &&
          chatUser?.id !== u.id
        ) {
          const audio = new Audio("/notify.mp3");
          audio.play().catch(() => {});
        }

        prevUnreadCounts.current[u.id] = unreadCount;
      });

      unsubscribers.push(unsubscribe);
    });

    return () => unsubscribers.forEach((fn) => fn());
  }, [users, user, chatUser]);

  const handleSelectUser = async (u: UserType) => {
    if (chatUser?.id === u.id) return;

    setChatUser(u);
    setUnreadCounts((prev) => ({ ...prev, [u.id]: 0 }));

    const q = query(collection(db, "chats", user!.uid, u.id), where("read", "==", false));
    const snapshot = await getDocs(q);
    const updates = snapshot.docs.map((docSnap) => updateDoc(docSnap.ref, { read: true }));
    await Promise.all(updates);
  };

  const handleSelectGroup = (g: Group) => {
    setChatUser({
      id: g.id,
      username: g.name,
      isGroup: true,
      members: g.members,
      avatar: g.avatar || `https://avatars.dicebear.com/api/identicon/${g.id}.svg`,
    });
  };

  const handleSignOut = async () => {
    if (!user) return;
    const statusRef = ref(rtdb, `/status/${user.uid}`);
    await rtdbSet(statusRef, false);
    await updateDoc(doc(db, "users", user.uid), { lastSeen: serverTimestamp() });
    await auth.signOut();
  };

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
      {/* Sidebar - Users list */}
      <div className="w-full md:w-1/4 p-4 bg-white dark:bg-gray-800 shadow-md rounded-md">
        <h2 className="flex items-center text-xl font-bold mb-4 text-gray-800 dark:text-gray-100 space-x-2">
          <img
            src={user.avatar}
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
                chatUser?.id === u.id ? "bg-blue-500 text-white" : "hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
              onClick={() => handleSelectUser(u)}
            >
              <div className="flex items-center space-x-2">
                <img
                  src={u.avatar}
                  alt={u.username}
                  className="w-8 h-8 rounded-full"
                />
                <span className="font-medium">{u.username}</span>
              </div>

              <div className="flex items-center space-x-2">
                <span
                  className={`w-3 h-3 rounded-full ${userStatuses[u.id] ? "bg-green-500" : "bg-gray-400"}`}
                  title={userStatuses[u.id] ? "Online" : "Offline"}
                ></span>
                {unreadCounts[u.id] > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                    {unreadCounts[u.id]}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Groups */}
        <div className="mt-6">
          <h3 className="text-md font-semibold mb-2 text-gray-700 dark:text-gray-200">Groups</h3>
          <button
            onClick={() => setShowCreateGroupModal(true)}
            className="text-sm bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600"
          >
            + Create
          </button>
          <div className="space-y-2">
            {groups.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between w-full px-3 py-2 rounded transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <button
                  className="flex items-center space-x-2 flex-1"
                  onClick={() => handleSelectGroup(g)}
                >
                  <img
                    src={g.avatar || `https://avatars.dicebear.com/api/identicon/${g.id}.svg`}
                    alt={g.name}
                    className="w-8 h-8 rounded-full"
                  />
                  <span className="font-medium">{g.name}</span>
                </button>

                <button
                  className="text-sm bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600"
                  onClick={() => openAddMemberModal(g)}
                >
                  + Member
                </button>
              </div>
            ))}
          </div>
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
            isGroup={chatUser.isGroup || false}  // <- add this
            groupMembers={chatUser.members || []} // optional, if needed in ChatBox
          />
        ) : (
          <p className="text-gray-500 dark:text-gray-400">
            Select a user or group to start chatting
          </p>
        )}
      </div>

      {/* Add Member Modal */}
      {showAddMemberModal && selectedGroup && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded shadow-lg w-80">
            <h2 className="text-lg font-bold mb-4">Add Member to {selectedGroup.name}</h2>

            <div className="max-h-60 overflow-y-auto space-y-2">
              {users
                .filter(u => !selectedGroup.members.includes(u.id))
                .map(u => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                  >
                    <span>{u.username}</span>
                    <button
                      className="text-sm bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600"
                      onClick={() => handleAddMember(u.id)}
                    >
                      Add
                    </button>
                  </div>
                ))}
            </div>

            <button
              className="mt-4 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              onClick={() => setShowAddMemberModal(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {showCreateGroupModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded shadow-lg w-80">
            <h2 className="text-lg font-bold mb-4">Create New Group</h2>

            <input
              type="text"
              placeholder="Group Name"
              className="w-full px-3 py-2 border rounded mb-4 dark:bg-gray-700 dark:text-white"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
            />

            <div className="flex justify-end space-x-2">
              <button
                className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-white rounded hover:bg-gray-400"
                onClick={() => setShowCreateGroupModal(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                onClick={handleCreateGroupSubmit}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}