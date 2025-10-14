"use client";

import { FC, useEffect, useState, useRef } from "react";
import { db, auth, rtdb, storage } from "@/firebaseConfig";
import { ref as rtdbRef, onValue } from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, doc, onSnapshot, query, orderBy, serverTimestamp, setDoc, getDoc } from "firebase/firestore";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";

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

const emojiReactions = ["👍", "❤️", "😂", "😮", "😢", "😡"];

const emojiMap: Record<string, string> = {
  ":)": "😊",
  ":D": "😄",
  ":(": "☹️",
  ";)": "😉",
  ":P": "😛",
  "<3": "❤️",
  ":O": "😮",
  ":/": "😕",
};

const parseEmojis = (text: string) => {
  let parsed = text;
  Object.keys(emojiMap).forEach((shortcut) => {
    const regex = new RegExp(escapeRegExp(shortcut), "g");
    parsed = parsed.replace(regex, emojiMap[shortcut]);
  });
  return parsed;
};

// Helper to escape regex special characters
function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


const ChatBox: FC<ChatBoxProps> = ({ chatWithUserId, chatWithUsername, currentUserId }) => {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null); // for the button
  const emojiPickerRef = useRef<HTMLDivElement>(null);    // for the picker

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setMessage(prev => prev + emojiData.emoji);
  };


  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  // Close popup when clicking outside
  /*useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        setSelectedMessageId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);*/

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(event.target as Node) &&
        emojiButtonRef.current &&
        !emojiButtonRef.current.contains(event.target as Node)
      ) {
        setShowEmojiPicker(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch chatWith user profile
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

  // Fetch current user profile
  useEffect(() => {
    const userRef = doc(db, "users", currentUserId);
    const unsubscribe = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) setCurrentUserProfile(docSnap.data() as UserProfile);
    });
    return () => unsubscribe();
  }, [currentUserId]);

  // Listen to messages
  useEffect(() => {
    const messagesRef = collection(db, "chats", currentUserId, chatWithUserId);
    const q = query(messagesRef, orderBy("timestamp"));
    const unsubscribe = onSnapshot(q, async snapshot => {
      const msgs: Message[] = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...(docSnap.data() as Omit<Message, "id">) }));
      setMessages(msgs);

      // Mark unread messages as read
      const batch: Promise<any>[] = [];
      msgs.forEach(msg => {
        if (!msg.read && msg.senderId === chatWithUserId) {
          const msgRef = doc(db, "chats", currentUserId, chatWithUserId, msg.id);
          batch.push(setDoc(msgRef, { read: true }, { merge: true }));
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

    // Fetch sender profile from Firestore
    const userSnap = await getDoc(doc(db, "users", senderId));
    const userData = userSnap.data();

    const senderName = userData?.username || "Unknown";
    const senderAvatar = userData?.avatar || `https://avatars.dicebear.com/api/identicon/${senderId}.svg`;

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
    if (updatedReactions[senderId] === emoji) delete updatedReactions[senderId];
    else updatedReactions[senderId] = emoji;

    try {
      await Promise.all([
        setDoc(messageRefSender, { reactions: updatedReactions }, { merge: true }),
        setDoc(messageRefReceiver, { reactions: updatedReactions }, { merge: true }),
      ]);
      setSelectedMessageId(null);
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

  if (!profile || !currentUserProfile) return null;

  return (
    <div className="flex flex-col h-full max-h-screen bg-white dark:bg-gray-800 shadow-md rounded-md border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center p-4 border-b border-gray-200 dark:border-gray-700">
        <img src={profile.avatar || "/default-avatar.png"} alt={profile.username} className="w-10 h-10 rounded-full mr-3" />
        <div>
          <div className="font-bold text-gray-900 dark:text-gray-100">{profile.username}</div>
          <div className={`text-sm ${profile.online ? "text-green-500" : "text-gray-500"}`}>
            {profile.online ? "Online" : "Offline"}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.map(msg => {
          const isSender = msg.senderId === currentUserId;
          const displayName = msg.senderName;
          const displayAvatar = msg.senderAvatar;

          return (
            <div key={msg.id} className={`flex ${isSender ? "justify-end" : "justify-start"} items-end`}>
              {/* Avatar */}
              <img
                src={displayAvatar || `https://avatars.dicebear.com/api/identicon/${msg.senderId}.svg`}
                alt={displayName}
                className={`w-8 h-8 rounded-full ${isSender ? "ml-2" : "mr-2"}`}
              />

              <div className="flex flex-col max-w-xs relative">
                {/* Username */}
                <span className={`text-xs font-semibold mb-1 ${isSender ? "text-right" : "text-left"} text-gray-700 dark:text-gray-300`}>
                  {displayName}
                </span>

                {/* Message bubble */}
                <div className={`px-4 py-2 rounded-lg break-words ${
                  isSender ? "bg-blue-500 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                }`}
                  onClick={() => setSelectedMessageId(msg.id === selectedMessageId ? null : msg.id)}
                >
                  {/* {msg.text} */}
                  {msg.text.startsWith("https://api.dicebear.com/") ? (
                    <img src={msg.text} alt="DiceBear Avatar" className="rounded max-w-full" />
                  ) : (
                    <span>{parseEmojis(msg.text)}</span>  // <-- here we convert shortcuts
                  )}
                  {msg.imageUrl && <img src={msg.imageUrl} alt="sent image" className="mt-2 rounded max-w-full" />}
                </div>

                {/* Timestamp */}
                <span className="text-xs text-gray-500 mt-1 self-end">
                  {msg.timestamp?.toDate ? msg.timestamp.toDate().toLocaleTimeString() : ""}
                </span>

                {/* Popup reactions */}
                {selectedMessageId === msg.id && (
                  <div ref={popupRef} className={`absolute ${isSender ? "right-0" : "left-0"} flex bg-white shadow-lg rounded-full p-1 z-50 -top-10`}>
                    {emojiReactions.map(emoji => (
                      <button key={emoji} className="text-lg px-1 hover:scale-125 transition-transform" onClick={() => toggleReaction(msg, emoji)}>
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}

                {/* Inline reactions */}
                {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                  <div className="flex space-x-1 mt-1">
                    {Object.values(msg.reactions).map((emoji, idx) => (
                      <span key={idx} className="text-sm">{emoji}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="relative w-full">
        <div className="relative w-full flex items-center border-t border-gray-200 dark:border-gray-700 p-3">
          <input
            type="text"
            placeholder="Type a message..."
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={e => e.key === "Enter" && sendMessage(message)}
            className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg p-2 mr-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
          />
          {/* Emoji Button */}
          <button
            type="button"
            ref={emojiButtonRef}
            onClick={() => setShowEmojiPicker(prev => !prev)}
            className="mr-2 text-xl"
          >
            😀
          </button>

          {showEmojiPicker && (
            <div ref={emojiPickerRef} className="absolute bottom-12 left-0 z-50 shadow-lg" style={{ minWidth: "280px" }}>
              <EmojiPicker onEmojiClick={handleEmojiClick} />
            </div>
          )}
          <label className="bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 px-3 py-2 rounded cursor-pointer text-sm">
            {uploading ? "Uploading..." : "📷"}
            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          </label>
          <button onClick={() => sendMessage(message)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg">
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatBox;
