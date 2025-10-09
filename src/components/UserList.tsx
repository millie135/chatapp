"use client";
import { FC, useEffect, useState } from "react";
import { db, auth } from "@/firebaseConfig";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
  where,
  getDoc,
} from "firebase/firestore";
import ChatBox from "./ChatBox";

interface User {
  id: string;
  username: string;
  avatar: string;
}

interface UserListProps {}

interface UnreadCounts {
  [userId: string]: number;
}

const UserList: FC<UserListProps> = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<UnreadCounts>({});

  const currentUserId = auth.currentUser!.uid;

  useEffect(() => {
    // Fetch all users except current
    const fetchUsers = async () => {
      const usersRef = collection(db, "users");
      const snapshot = await getDocs(usersRef);
      const allUsers: User[] = [];
      snapshot.forEach((doc) => {
        if (doc.id !== currentUserId) {
          allUsers.push({ id: doc.id, ...(doc.data() as any) });
        }
      });
      setUsers(allUsers);
    };
    fetchUsers();
  }, []);

  useEffect(() => {
    // Listen to all chats where current user is the receiver
    const unsubscribeList: (() => void)[] = [];

    users.forEach((user) => {
      const chatRef = collection(db, "chats", user.id, currentUserId);
      const q = query(chatRef, orderBy("timestamp"));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        let unread = 0;
        snapshot.docs.forEach((doc) => {
          const data = doc.data() as any;
          if (!data.read && data.senderId === user.id) unread++;
        });
        setUnreadCounts((prev) => ({ ...prev, [user.id]: unread }));
      });
      unsubscribeList.push(unsubscribe);
    });

    return () => unsubscribeList.forEach((fn) => fn());
  }, [users]);

  const openChat = async (user: User) => {
    setSelectedUser(user);

    // Mark messages as read
    const chatRef = collection(db, "chats", user.id, currentUserId);
    const snapshot = await getDocs(chatRef);
    snapshot.forEach(async (docSnap) => {
      const data = docSnap.data() as any;
      if (!data.read && data.senderId === user.id) {
        const docRef = doc(db, "chats", user.id, currentUserId, docSnap.id);
        await updateDoc(docRef, { read: true });
      }
    });
  };

  return (
    <div className="flex h-full">
      {/* User List */}
      <div className="w-64 border-r border-gray-300 dark:border-gray-700 p-2 overflow-y-auto">
        {users.map((user) => (
          <div
            key={user.id}
            className="flex items-center justify-between p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
            onClick={() => openChat(user)}
          >
            <div className="flex items-center">
              <img
                src={user.avatar || "/default-avatar.png"}
                alt={user.username}
                className="w-10 h-10 rounded-full mr-2"
              />
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {user.username}
              </span>
            </div>
            {unreadCounts[user.id] > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {unreadCounts[user.id]}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Chat Box */}
      <div className="flex-1 p-2">
        {selectedUser ? (
          <ChatBox
            chatWithUserId={selectedUser.id}
            chatWithUsername={selectedUser.username}
            chatWithAvatar={selectedUser.avatar}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            Select a user to start chatting
          </div>
        )}
      </div>
    </div>
  );
};

export default UserList;
