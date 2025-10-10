"use client";
import { FC, useEffect, useState, useRef } from "react";
import { db, auth } from "@/firebaseConfig";
import { rtdb } from "@/firebaseConfig"; // make sure rtdb is exported from your config
import { ref, onValue } from "firebase/database";

import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";

interface ChatBoxProps {
  chatWithUserId: string;
  chatWithUsername: string;
  chatWithAvatar?: string;
}

interface Message {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  timestamp: any;
}

interface UserProfile {
  username: string;
  avatar: string;
  online?: boolean;
}

const ChatBox: FC<ChatBoxProps> = ({
  chatWithUserId,
  chatWithUsername,
  chatWithAvatar,
}) => {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom whenever messages update
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  /*useEffect(() => {
    const docRef = doc(db, "users", chatWithUserId);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setProfile(docSnap.data() as UserProfile);
      }
    });
    return () => unsubscribe();
  }, [chatWithUserId]);*/

  useEffect(() => {
    const profileRef = doc(db, "users", chatWithUserId);
    const statusRef = ref(rtdb, `/status/${chatWithUserId}`);

    // Listen to Firestore for profile info
    const unsubscribeProfile = onSnapshot(profileRef, (docSnap) => {
      if (docSnap.exists()) {
        //setProfile(prev => ({ ...docSnap.data(), online: prev?.online }));
        const data = docSnap.data() as UserProfile;
        setProfile(prev => ({ ...data, online: prev?.online }));

      }
    });

    // Listen to Realtime Database for online/offline
    const unsubscribeStatus = onValue(statusRef, (snap) => {
      const isOnline = snap.val() === true;
      setProfile(prev => prev ? { ...prev, online: isOnline } : { username: "", avatar: "", online: isOnline });
    });

    return () => {
      unsubscribeProfile();
      unsubscribeStatus();
    };
  }, [chatWithUserId]);



  

  useEffect(() => {
    const messagesRef = collection(
      db,
      "chats",
      auth.currentUser!.uid,
      chatWithUserId
    );
    const q = query(messagesRef, orderBy("timestamp"));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const msgs = snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) }));
      setMessages(msgs);

      // Mark unread messages as read
      const batchUpdates: Promise<any>[] = [];
      msgs.forEach((msg) => {
        if (!msg.read && msg.senderId !== auth.currentUser!.uid) {
          const msgRef = doc(db, "chats", auth.currentUser!.uid, chatWithUserId, msg.id);
          batchUpdates.push(updateDoc(msgRef, { read: true }));
        }
      });

      if (batchUpdates.length > 0) await Promise.all(batchUpdates);
    });
    return () => unsubscribe();
  }, [chatWithUserId]);

  useEffect(scrollToBottom, [messages]);

  const sendMessage = async () => {
    if (!message.trim()) return;

    const senderId = auth.currentUser!.uid;
    const senderName = auth.currentUser!.displayName || auth.currentUser!.email;
    const senderAvatar = auth.currentUser!.photoURL || "https://api.dicebear.com/9.x/lorelei/svg";

    
    const messageData = {
      text: message,
      senderId,
      senderName,
      senderAvatar, 
      timestamp: serverTimestamp(),
    };

    // Sender's path
    const senderRef = collection(db, "chats", senderId, chatWithUserId);
    // Receiver's path
    const receiverRef = collection(db, "chats", chatWithUserId, senderId);


    try {
      await Promise.all([
        addDoc(senderRef, messageData),
        addDoc(receiverRef, messageData),
      ]);
      setMessage("");
    } catch (err) {
      console.error("Error sending message:", err);
    }
  };


  if (!profile) return null;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 shadow-md rounded-md border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center p-4 border-b border-gray-200 dark:border-gray-700">
        <img src={profile?.avatar && profile.avatar.trim() !== "" ? profile.avatar : "/default-avatar.png"} alt={profile?.username || "User"} className="w-10 h-10 rounded-full mr-3" />
        <div>
          <div className="font-bold text-gray-900 dark:text-gray-100">{profile.username || "Unknown User"}</div>
          {/* <div className="text-sm text-gray-500 dark:text-gray-400">Online</div> */}
          <div
            className={`text-sm ${
              profile?.online ? "text-green-500" : "text-gray-500"
            }`}
          >
            {profile?.online ? "Online" : "Offline"}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-end space-x-2 ${
              msg.senderId === auth.currentUser!.uid ? "justify-end" : "justify-start"
            }`}
          >
            {msg.senderId !== auth.currentUser!.uid && (
              <img
                src={msg.senderAvatar || profile.avatar || "/default-avatar.png"}
                alt={msg.senderName}
                className="w-8 h-8 rounded-full mr-2"
              />
            )}
            <div
              className={`px-4 py-2 rounded-lg max-w-xs break-words ${
                msg.senderId === auth.currentUser!.uid
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              }`}
            >
              {msg.text}
            </div>
            {msg.senderId === auth.currentUser!.uid && (
              <img
                src={msg.senderAvatar || "/default-avatar.png"}
                alt={msg.senderName}
                className="w-8 h-8 rounded-full"
              />
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex items-center border-t border-gray-200 dark:border-gray-700 p-3">
        <input
          type="text"
          placeholder="Type a message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg p-2 mr-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
        />
        <button
          onClick={sendMessage}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default ChatBox;
