"use client";
import { FC, useEffect, useState, useRef } from "react";
import { db, auth, rtdb, storage } from "@/firebaseConfig";
import { ref as rtdbRef, onValue } from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import EmojiPicker from "emoji-picker-react";
import { collection, doc, onSnapshot, query, orderBy, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

interface ChatBoxProps {
  chatWithUserId: string;
  chatWithUsername: string;
  currentUserId: string;
}

interface Message {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  timestamp: any;
   imageUrl: string | null;
  reactions?: Record<string, string>;
  to: string;
  read: boolean;
}

interface UserProfile {
  username: string;
  avatar: string;
  online?: boolean;
}

const ChatBox: FC<ChatBoxProps> = ({ chatWithUserId, chatWithUsername, currentUserId }) => {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null);


  // Scroll to bottom
  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  // Fetch chat user's profile and online status
  useEffect(() => {
    const profileRef = doc(db, "users", chatWithUserId);
    const statusRef = rtdbRef(rtdb, `/status/${chatWithUserId}`);

    const unsubscribeProfile = onSnapshot(profileRef, docSnap => {
      if (docSnap.exists()) {
        const data = docSnap.data() as UserProfile;
        setProfile(prev => ({ ...data, online: prev?.online }));
      }
    });

    const unsubscribeStatus = onValue(statusRef, snap => {
      const isOnline = snap.val() === true;
      setProfile(prev => prev ? { ...prev, online: isOnline } : { username: "", avatar: "", online: isOnline });
    });

    return () => {
      unsubscribeProfile();
      unsubscribeStatus();
    };
  }, [chatWithUserId]);

  // Listen to messages
  useEffect(() => {
    const senderRef = collection(db, "chats", currentUserId, chatWithUserId);
    const receiverRef = collection(db, "chats", chatWithUserId, currentUserId);

    const qSender = query(senderRef, orderBy("timestamp"));
    const unsubscribe = onSnapshot(qSender, async snapshot => {
      //const msgs: Message[] = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Message) }));
      const msgs: Message[] = snapshot.docs.map(docSnap => {
        const data = docSnap.data() as Omit<Message, "id">; // remove id from type
        return {
          id: docSnap.id,   // use Firestore doc ID
          ...data,          // other fields
        };
      });

      setMessages(msgs);

      // Mark unread messages from chatWithUserId as read
      const batch: Promise<any>[] = [];
      msgs.forEach(msg => {
        if (!msg.read && msg.senderId === chatWithUserId) {
          const msgRef = doc(db, "chats", currentUserId, chatWithUserId, msg.id);
          batch.push(updateDoc(msgRef, { read: true }));
        }
      });
      if (batch.length > 0) await Promise.all(batch);
    });

    return () => unsubscribe();
  }, [chatWithUserId, currentUserId]);

  useEffect(scrollToBottom, [messages]);

  const sendMessage = async (text?: string, imageUrl?: string) => {
    if (!text?.trim() && !imageUrl) return;

    const senderId = currentUserId;
    const receiverId = chatWithUserId;
    const senderName = auth.currentUser?.displayName || auth.currentUser?.email || "Unknown";
    const senderAvatar = auth.currentUser?.photoURL || "https://api.dicebear.com/9.x/lorelei/svg";

    const messageId = doc(collection(db, "chats", senderId, receiverId)).id;

    const messageData: Message = {
      id: messageId,
      text: text || "",
      senderId,
      senderName,
      senderAvatar,
      timestamp: serverTimestamp(),
      imageUrl: imageUrl ?? null,
      reactions: {},
      read: false,
      to: receiverId,
    };

    try {
      await Promise.all([
        setDoc(doc(db, "chats", senderId, receiverId, messageId), messageData),
        setDoc(doc(db, "chats", receiverId, senderId, messageId), messageData),
      ]);
      setMessage("");
    } catch (err) {
      console.error("Error sending message:", err);
    }
  };

  const toggleReaction = async (msg: Message, emoji: string) => {
    const senderId = currentUserId;
    const receiverId = chatWithUserId;

    const messageRefSender = doc(db, "chats", senderId, receiverId, msg.id);
    const messageRefReceiver = doc(db, "chats", receiverId, senderId, msg.id);

    const updatedReactions = { ...(msg.reactions || {}) };
    if (updatedReactions[senderId] === emoji) {
      delete updatedReactions[senderId];
    } else {
      updatedReactions[senderId] = emoji;
    }

    try {
      await Promise.all([
        updateDoc(messageRefSender, { reactions: updatedReactions }),
        updateDoc(messageRefReceiver, { reactions: updatedReactions }),
      ]);
    } catch (err) {
      console.error("Failed to update reactions:", err);
    }
  };



  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    const fileRef = storageRef(storage, `chatImages/${currentUserId}-${Date.now()}-${file.name}`);
    setUploading(true);

    try {
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      await sendMessage("", url);
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleEmojiClick = (emojiData: any) => {
    setMessage(prev => prev + emojiData.emoji);
    setShowEmojiPicker(false);
  };

  if (!profile) return null;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 shadow-md rounded-md border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center p-4 border-b border-gray-200 dark:border-gray-700">
        <img src={profile.avatar || "/default-avatar.png"} alt={profile.username} className="w-10 h-10 rounded-full mr-3" />
        <div>
          <div className="font-bold text-gray-900 dark:text-gray-100">{profile.username}</div>
          <div className={`text-sm ${profile.online ? "text-green-500" : "text-gray-500"}`}>{profile.online ? "Online" : "Offline"}</div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex items-end ${msg.senderId === currentUserId ? "justify-end" : "justify-start"} relative`}
          >
            {msg.senderId !== currentUserId && (
              <img
                src={msg.senderAvatar || profile.avatar || "/default-avatar.png"}
                alt={msg.senderName}
                className="w-8 h-8 rounded-full mr-2"
              />
            )}

            <div className="flex flex-col max-w-xs">
              {/* Message bubble */}
              <div
                className={`px-4 py-2 rounded-lg break-words relative cursor-pointer ${
                  msg.senderId === currentUserId
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                }`}
                onClick={() => setSelectedMessage(msg.id)}
              >
                {msg.text}
                {msg.imageUrl && (
                  <img src={msg.imageUrl} alt="sent image" className="mt-2 rounded max-w-full" />
                )}
              </div>

              {/* Inline reactions */}
              {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                <div className="flex space-x-1 mt-1 ml-1">
                  {Object.values(msg.reactions).map((emoji, idx) => (
                    <span key={idx} className="text-sm">{emoji}</span>
                  ))}
                </div>
              )}

              {/* Reaction buttons (show when message selected) */}
              {selectedMessage === msg.id && (
                <div className="flex space-x-1 mt-1 ml-1">
                  {["👍","❤️","😂","😮","😢","👎"].map(emoji => (
                    <button
                      key={emoji}
                      className="text-sm px-1 hover:bg-gray-300 rounded"
                      onClick={() => toggleReaction(msg, emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}


        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="relative w-full">
        <div className="flex items-center border-t border-gray-200 dark:border-gray-700 p-3">
          <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} className="mr-2 text-2xl">😊</button>
          <input
            type="text"
            placeholder="Type a message..."
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={e => e.key === "Enter" && sendMessage(message)}
            className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg p-2 mr-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
          />
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
