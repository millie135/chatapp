"use client";
import { FC, useEffect, useState, useRef } from "react";
import { db, auth } from "@/firebaseConfig";
import { rtdb } from "@/firebaseConfig"; // make sure rtdb is exported from your config
import { ref as rtdbRef, onValue } from "firebase/database";
import { storage } from "@/firebaseConfig";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import EmojiPicker from "emoji-picker-react";

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
  setDoc
} from "firebase/firestore";

interface ChatBoxProps {
  chatWithUserId: string;
  chatWithUsername: string;
  chatWithAvatar?: string;
  onReadMessages?: () => void;
  isManager?: boolean;
  currentUserId?: string;
  managerViewUserId?: string; 
}

interface Message {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  timestamp: any;
  imageUrl?: string;
  reactions?: Record<string, string>;
  to: string;
  read: boolean;
}

interface UserProfile {
  username: string;
  avatar: string;
  online?: boolean;
}

const emojiShortcuts: Record<string, string> = {
  ":)": "😊",
  ":-)": "😊",
  ":D": "😄",
  ":-D": "😄",
  ":(": "☹️",
  ":-(": "☹️",
  ";)": "😉",
  ";-)": "😉",
  ":P": "😋",
  ":'(": "😢",
  "<3": "❤️",
};


const ChatBox: FC<ChatBoxProps> = ({
  chatWithUserId,
  chatWithUsername,
  chatWithAvatar,
  onReadMessages,
  isManager = false,
  currentUserId,
  managerViewUserId,
}) => {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  // const messageId = doc(collection(db, "chats")).id; // generate unique ID
  // const senderRef = doc(db, "chats", senderId, chatWithUserId, messageId);
  // const receiverRef = doc(db, "chats", chatWithUserId, senderId, messageId);

  // Scroll to bottom whenever messages update
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    const profileRef = doc(db, "users", chatWithUserId);
    //const statusRef = ref(rtdb, `/status/${chatWithUserId}`);
    const statusRef = rtdbRef(rtdb, `/status/${chatWithUserId}`);

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
    if (!auth.currentUser) return;

    //const viewerId = isManager && managerViewUserId ? managerViewUserId : auth.currentUser.uid;
    const viewerId = isManager && currentUserId ? currentUserId : auth.currentUser.uid;
    const targetId = chatWithUserId;

    // If manager is viewing someone else's chat, use their ids
    // if (isManager && managerViewUserId && currentUserId) {
    //   viewerId = managerViewUserId; // e.g. userA
    //   targetId = chatWithUserId;    // e.g. userB
    // }

    //const messagesRef = collection(db, "chats", viewerId, targetId);
    //const q = query(messagesRef, orderBy("timestamp"));

    const ref1 = collection(db, "chats", viewerId, targetId);
    const ref2 = collection(db, "chats", targetId, viewerId);

    const q1 = query(ref1, orderBy("timestamp"));
    const q2 = query(ref2, orderBy("timestamp"));

    /*const unsubscribe1 = onSnapshot(q1, async (snapshot) => {
      
      const msgs: Message[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          text: data.text || "",
          senderId: data.senderId || "",
          senderName: data.senderName || "",
          senderAvatar: data.senderAvatar || "",
          timestamp: data.timestamp || null,
          imageUrl: data.imageUrl || null,
          reactions: data.reactions || {},
          to: data.to || "",
          read: data.read ?? false,
        };
      });
      setMessages(msgs);

      // Mark unread messages as read
      const batch: Promise<any>[] = [];

      msgs.forEach((msg) => {
        if (!msg.read && msg.senderId !== viewerId) {
          const msgRef = doc(db, "chats", viewerId, targetId, msg.id);
          batch.push(updateDoc(msgRef, { read: true }));
        }
      });

      //if (batchUpdates.length > 0) await Promise.all(batchUpdates);
      if (batch.length > 0) {
        await Promise.all(batch);
        if (onReadMessages) onReadMessages();
      }
    });*/
    const unsubscribe1 = onSnapshot(q1, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Message) }));
      setMessages(prev => {
        const others = prev.filter(m => m.senderId !== targetId && m.to !== targetId);
        return [...others, ...msgs].sort((a, b) => a.timestamp?.seconds - b.timestamp?.seconds);
      });
    });

    const unsubscribe2 = onSnapshot(q2, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Message) }));
      setMessages(prev => {
        const others = prev.filter(m => m.senderId !== viewerId && m.to !== viewerId);
        return [...others, ...msgs].sort((a, b) => a.timestamp?.seconds - b.timestamp?.seconds);
      });
    });
    return () => {
      unsubscribe1();
      unsubscribe2();
    };
  }, [chatWithUserId, isManager, currentUserId]);

  useEffect(scrollToBottom, [messages]);

  const sendMessage = async (text?: string, imageUrl?: string) => {
    if (!text?.trim() && !imageUrl) return;
    if (!auth.currentUser) return;

    const senderId = auth.currentUser!.uid;
    const receiverId = chatWithUserId;
    const senderName = auth.currentUser.displayName || auth.currentUser.email;
    const senderAvatar = auth.currentUser!.photoURL || "https://api.dicebear.com/9.x/lorelei/svg";

    const messageId = doc(collection(db, "chats", senderId, receiverId)).id; // generate unique ID
    
    const messageData = {
      id: messageId,
      text: text || "",
      senderId,
      senderName,
      senderAvatar, 
      timestamp: serverTimestamp(),
      imageUrl: imageUrl || null,
      reactions: {},
      read: false,
      to: receiverId // optional: track recipient
    };

    // Sender's path
    //const senderRef = collection(db, "chats", senderId, chatWithUserId);
    // Receiver's path
    //const receiverRef = collection(db, "chats", chatWithUserId, senderId);

     // Sender and Receiver paths
      // const senderRef = doc(db, "chats", senderId, "messages", messageId);
      // const receiverRef = doc(db, "chats", chatWithUserId, "messages", messageId);

    const senderRef = doc(db, "chats", senderId, receiverId, messageId);
    const receiverRef = doc(db, "chats", receiverId, senderId, messageId);  

    try {
      // await Promise.all([
      //   setDoc(senderRef, messageData),
      //   setDoc(receiverRef, messageData),
      // ]);
      // setMessage("");
      // Write only to your own collection
      /*const senderRef = doc(db, "chats", senderId, receiverId, messageId);
      const receiverRef = doc(db, "chats", receiverId, senderId, messageId);
      // Save for both sender and receiver
      await Promise.all([
        setDoc(senderRef, messageData),
        setDoc(receiverRef, messageData),
      ]);
      setMessage("");*/
      await Promise.all([setDoc(senderRef, messageData), setDoc(receiverRef, messageData)]);
      setMessage("");
    } catch (err) {
      console.error("Error sending message:", err);
    }
  };

  // Handle image upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    //if (!e.target.files || e.target.files.length === 0) return;
    if (!e.target.files?.length) return;

    const file = e.target.files[0];
    const fileRef = storageRef(storage, `chatImages/${auth.currentUser!.uid}-${Date.now()}-${file.name}`);
    setUploading(true);

    try {
      await uploadBytes(fileRef, file);
      const imageUrl = await getDownloadURL(fileRef);
      await sendMessage("", imageUrl);
    } catch (err) {
      console.error("Image upload failed:", err);
    } finally {
      setUploading(false);
      e.target.value = ""; // reset input
    }
  };

  const handleEmojiClick = (emojiData: any) => {
    setMessage((prev) => prev + emojiData.emoji);
    setShowEmojiPicker(false);
  };

  const replaceEmojiShortcuts = (text: string) => {
    let replaced = text;
    Object.entries(emojiShortcuts).forEach(([shortcut, emoji]) => {
      const regex = new RegExp(shortcut.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"), "g");
      replaced = replaced.replace(regex, emoji);
    });
    return replaced;
  };

  const handleAddReaction = async (messageId: string, emoji: string) => {
    if (!auth.currentUser) return;
    const senderId = auth.currentUser.uid;

    const messageRef = doc(db, "chats", senderId, chatWithUserId, messageId);
    const receiverRef = doc(db, "chats", chatWithUserId, senderId, messageId);

    try {
      // Add the reaction for this user
      await Promise.all([
        updateDoc(messageRef, { [`reactions.${senderId}`]: emoji }),
        updateDoc(receiverRef, { [`reactions.${senderId}`]: emoji }),
      ]);
    } catch (err) {
      console.error("Error adding reaction:", err);
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
      {/* <div className="flex-1 overflow-y-auto p-4 space-y-2">
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

            <div className="relative group">
              <div
                className={`px-4 py-2 rounded-lg max-w-xs break-words ${
                  msg.senderId === auth.currentUser!.uid
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                }`}
              >
                {msg.text}
                {msg.imageUrl && (
                  <img src={msg.imageUrl} alt="sent image" className="mt-2 rounded max-w-full" />
                )}
              </div>

              
              <div className={`absolute hidden group-hover:flex space-x-1 bg-white dark:bg-gray-800 border rounded-full p-1 shadow-md z-50 -top-8 ${
                msg.senderId === auth.currentUser!.uid
                  ? "right-0" // align to right for sender
                  : "left-0"  // align to left for receiver
              }`}>
                {["👍", "❤️", "😂", "😮", "😢", "🔥"].map((emoji) => (
                  <button
                    key={emoji}
                    className="hover:scale-125 transition-transform"
                    onClick={() => handleAddReaction(msg.id, emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              
              {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                <div className="flex mt-1 space-x-1">
                  {Object.values(msg.reactions).map((emoji, index) => (
                    <span key={index} className="text-sm">
                      {emoji}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div> */}

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.map(msg => (
          <div key={msg.id} className={`flex items-end space-x-2 ${msg.senderId === auth.currentUser!.uid ? "justify-end" : "justify-start"}`}>
            {msg.senderId !== auth.currentUser!.uid && (
              <img src={msg.senderAvatar || profile.avatar || "/default-avatar.png"} alt={msg.senderName} className="w-8 h-8 rounded-full mr-2" />
            )}
            <div className="relative group">
              <div className={`px-4 py-2 rounded-lg max-w-xs break-words ${msg.senderId === auth.currentUser!.uid ? "bg-blue-500 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100"}`}>
                {msg.text}
                {msg.imageUrl && <img src={msg.imageUrl} alt="sent image" className="mt-2 rounded max-w-full" />}
              </div>

              {/* Reactions */}
              <div className={`absolute hidden group-hover:flex space-x-1 bg-white dark:bg-gray-800 border rounded-full p-1 shadow-md z-50 -top-8 ${msg.senderId === auth.currentUser!.uid ? "right-0" : "left-0"}`}>
                {["👍", "❤️", "😂", "😮", "😢", "🔥"].map(emoji => (
                  <button key={emoji} className="hover:scale-125 transition-transform" onClick={() => handleAddReaction(msg.id, emoji)}>{emoji}</button>
                ))}
              </div>

              {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                <div className="flex mt-1 space-x-1">{Object.values(msg.reactions).map((emoji, idx) => <span key={idx} className="text-sm">{emoji}</span>)}</div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {/* <div className="relative w-full">
        <div className="flex items-center border-t border-gray-200 dark:border-gray-700 p-3">
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="mr-2 text-2xl"
          >
            😊
          </button>
          <input
            // ref={inputRef}
            type="text"
            placeholder="Type a message..."
            value={message}
            onChange={(e) => setMessage(replaceEmojiShortcuts(e.target.value))}
            onKeyDown={(e) => e.key === "Enter" && sendMessage(message)}
            className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg p-2 mr-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
          />
          <label className="bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 px-3 py-2 rounded cursor-pointer text-sm">
            {uploading ? "Uploading..." : "📷"}
            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          </label>
          <button
            onClick={() => sendMessage(message)} 
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
          >
            Send
          </button>
        </div>
        {showEmojiPicker && (
          <div className="absolute bottom-16 left-4 z-50">
            <EmojiPicker onEmojiClick={handleEmojiClick} />
          </div>
        )}
      </div> */}
      <div className="relative w-full">
        <div className="flex items-center border-t border-gray-200 dark:border-gray-700 p-3">
          <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} className="mr-2 text-2xl">😊</button>
          <input type="text" placeholder="Type a message..." value={message} onChange={e => setMessage(replaceEmojiShortcuts(e.target.value))} onKeyDown={e => e.key === "Enter" && sendMessage(message)} className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg p-2 mr-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" />
          <label className="bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 px-3 py-2 rounded cursor-pointer text-sm">
            {uploading ? "Uploading..." : "📷"}
            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          </label>
          <button onClick={() => sendMessage(message)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg">Send</button>
        </div>
        {showEmojiPicker && <div className="absolute bottom-16 left-4 z-50"><EmojiPicker onEmojiClick={handleEmojiClick} /></div>}
      </div>
    </div>
  );
};

export default ChatBox;