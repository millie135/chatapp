"use client";

import { FC, useEffect, useState, useRef } from "react";
import { db, rtdb, storage } from "@/firebaseConfig";
import { ref as rtdbRef, onValue } from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth } from "@/firebaseConfig";
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  setDoc,
  getDoc
} from "firebase/firestore";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";

interface ChatBoxProps {
  chatWithUserId: string;
  chatWithUsername: string;
  currentUserId: string;
  isGroup?: boolean;
  groupMembers?: string[];
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
  //read: boolean;
  readBy?: Record<string, boolean>; 
}

interface UserProfile {
  id?: string;
  username: string;
  avatar: string;
  //online?: boolean;
  onlineStatus?: "online" | "onBreak" | "offline";
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

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const ChatBox: FC<ChatBoxProps> = ({
  chatWithUserId,
  // chatWithUsername,
  currentUserId,
  isGroup = false,
  groupMembers = []
}) => {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [groupMemberProfiles, setGroupMemberProfiles] = useState<UserProfile[]>([]);
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [userStatuses, setUserStatuses] = useState<{ [key: string]: "online" | "onBreak" | "offline" }>({});
  const [showMembers, setShowMembers] = useState(false);
  const memberListRef = useRef<HTMLDivElement>(null);
  const memberButtonRef = useRef<HTMLDivElement>(null);
  const chatBoxRef = useRef<HTMLDivElement>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setMessage(prev => prev + emojiData.emoji);
  };

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  // Close emoji picker when clicking outside
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

      if (
        memberListRef.current &&
        !memberListRef.current.contains(event.target as Node)
      ) {
        setShowMembers(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch chatWith user or group profile
  useEffect(() => {
    if (isGroup) {
      const groupRef = doc(db, "groups", chatWithUserId);
      const unsubscribe = onSnapshot(groupRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as { name: string; avatar: string };
          setProfile({
            username: data.name,
            avatar: data.avatar || `https://avatars.dicebear.com/api/identicon/${chatWithUserId}.svg`
          });
        }
      });

      return () => unsubscribe();
    }

    const profileRef = doc(db, "users", chatWithUserId);
    const statusRef = rtdbRef(rtdb, `/status/${chatWithUserId}`);

    const unsubscribeProfile = onSnapshot(profileRef, docSnap => {
      if (docSnap.exists()) {
        const data = docSnap.data() as UserProfile;
        setProfile(prev => ({ ...data, onlineStatus: prev?.onlineStatus }));
      }
    });

    // For 1-on-1 status
    const unsubscribeStatus = onValue(statusRef, snap => {
      //const status = snap.val(); // "online" | "onBreak" | "offline"
      const status = snap.val() || "offline";
      setProfile(prev => prev ? { ...prev, onlineStatus: status } : { username: "", avatar: "", onlineStatus: status });
    });

    return () => {
      unsubscribeProfile();
      unsubscribeStatus();
    };
  }, [chatWithUserId, isGroup]);

  // Track online/offline status for group members
  useEffect(() => {
    if (!isGroup || !groupMembers.length) return;

    const unsubscribers: (() => void)[] = [];

    groupMembers.forEach((memberId) => {
      const statusRef = rtdbRef(rtdb, `/status/${memberId}`);
      const unsubscribe = onValue(statusRef, (snap) => {
        const status = snap.val(); // "online" | "onBreak" | "offline"
        setUserStatuses(prev => ({ ...prev, [memberId]: status }));
      });
      unsubscribers.push(unsubscribe);
    });

    return () => unsubscribers.forEach((fn) => fn());
  }, [isGroup, groupMembers]);


  // Fetch current user profile
  useEffect(() => {
    const userRef = doc(db, "users", currentUserId);
    const unsubscribe = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) setCurrentUserProfile(docSnap.data() as UserProfile);
    });
    return () => unsubscribe();
  }, [currentUserId]);

  // Fetch group member profiles
  useEffect(() => {
    if (!isGroup || !groupMembers.length) return;

    const fetchProfiles = async () => {
      const profiles: UserProfile[] = [];
      for (const memberId of groupMembers) {
        const docSnap = await getDoc(doc(db, "users", memberId));
        if (docSnap.exists()) profiles.push({ id: memberId, ...(docSnap.data() as UserProfile) });
      }
      setGroupMemberProfiles(profiles);
    };
    fetchProfiles();
  }, [isGroup, groupMembers]);

  // Listen to messages
  
  useEffect(() => {
    const messagesRef = isGroup
      ? collection(db, "groupChats", chatWithUserId, "messages")
      : collection(db, "chats", currentUserId, chatWithUserId);

    const q = query(messagesRef, orderBy("timestamp"));

    const unsubscribe = onSnapshot(q, async snapshot => {
      const msgs: Message[] = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Message, "id">)
      }));
      setMessages(msgs);

      // Compute unread messages for current user
      let newUnreadCount = 0;
      msgs.forEach(msg => {
        if (!msg.readBy?.[currentUserId] && msg.senderId !== currentUserId) {
          newUnreadCount += 1;
        }
      });
      setUnreadCount(newUnreadCount);

      // Immediately mark all visible messages as read
      const batch: Promise<any>[] = [];
      msgs.forEach(msg => {
        if (!msg.readBy?.[currentUserId]) {
          const msgRef = isGroup
            ? doc(db, "groupChats", chatWithUserId, "messages", msg.id)
            : doc(db, "chats", currentUserId, chatWithUserId, msg.id);

          batch.push(
            setDoc(msgRef, { readBy: { ...(msg.readBy || {}), [currentUserId]: true } }, { merge: true })
          );
        }
      });

      if (batch.length > 0) await Promise.all(batch);
    });

    return () => unsubscribe();
  }, [chatWithUserId, currentUserId, isGroup]);



  useEffect(scrollToBottom, [messages]);

 const sendMessage = async (text?: string, imageUrl?: string) => {
    if (!text?.trim() && !imageUrl) return;

    const senderSnap = await getDoc(doc(db, "users", currentUserId));
    const senderData = senderSnap.data();
    const senderName = senderData?.username || "Unknown";
    const senderAvatar = senderData?.avatar || `https://avatars.dicebear.com/api/identicon/${currentUserId}.svg`;

    // Generate a new message doc reference
    const messageRef = isGroup
      ? doc(collection(db, "groupChats", chatWithUserId, "messages"))
      : doc(collection(db, "chats", currentUserId, chatWithUserId));

    const messageData: Message = {
      id: messageRef.id,
      text: text || "",
      senderId: currentUserId,
      senderName,
      senderAvatar,
      timestamp: serverTimestamp(),
      imageUrl: imageUrl ?? null,
      reactions: {},
      //read: false,
      to: chatWithUserId,
      readBy: { [currentUserId]: true },
    };

    try {
      if (isGroup) {
        // Write message to group subcollection
        await setDoc(messageRef, messageData);
      } else {
        // 1-on-1 messages
        await Promise.all([
          setDoc(messageRef, messageData),
          setDoc(doc(db, "chats", chatWithUserId, currentUserId, messageRef.id), messageData),
        ]);
      }
      setMessage("");
    } catch (err) {
      console.error("Error sending message:", err);
    }
  };



  const toggleReaction = async (msg: Message, emoji: string) => {
    const messageRef = isGroup
      ? doc(db, "groupChats", chatWithUserId, "messages", msg.id)
      : doc(db, "chats", currentUserId, chatWithUserId, msg.id);

    const updatedReactions = { ...(msg.reactions || {}) };
    if (updatedReactions[currentUserId] === emoji) delete updatedReactions[currentUserId];
    else updatedReactions[currentUserId] = emoji;

    try {
      await setDoc(messageRef, { reactions: updatedReactions }, { merge: true });
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
    <div ref={chatBoxRef} className="flex flex-col h-full max-h-screen bg-white dark:bg-gray-800 shadow-md rounded-md border border-gray-200 dark:border-gray-700 relative">
      {/* Header */}
      <div className="flex items-center p-4 border-b border-gray-200 dark:border-gray-700 justify-between">
        <div className="flex items-center">
          <img src={profile.avatar || "/default-avatar.png"} alt={profile.username} className="w-10 h-10 rounded-full mr-3" />
          <div>
            <div className="font-bold text-gray-900 dark:text-gray-100">{profile.username}</div>
            {!isGroup && (
              <div className={`text-sm ${
                profile.onlineStatus === "online" ? "text-green-500" :
                profile.onlineStatus === "onBreak" ? "text-yellow-400" :
                "text-gray-500"
              }`}>
                {profile.onlineStatus === "online" ? "Online" :
                profile.onlineStatus === "onBreak" ? "On Break" :
                "Offline"}
              </div>
            )}
            {isGroup && (
              <div className="flex dark:border-gray-700">
                <div className="flex items-center space-x-2">
                  <div
                    className="text-sm text-gray-500 dark:text-gray-400 cursor-pointer relative"
                    onClick={() => setShowMembers(prev => !prev)}
                  >
                    {groupMemberProfiles.length} members
                    {unreadCount > 0 && (
                      <span className="absolute -top-2 -right-4 bg-red-500 text-white text-xs font-bold rounded-full px-2">
                        {unreadCount}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex -space-x-2">
                  {groupMemberProfiles.map((member) => {
                    const online = userStatuses[member.id!] || false;
                    return (
                      <img
                        key={member.id}
                        src={member.avatar || `https://avatars.dicebear.com/api/identicon/${member.id}.svg`}
                        alt={member.username}
                        className={`w-6 h-6 rounded-full border-2 border-white ${
                          status === "online" ? "ring-2 ring-green-500" :
                          status === "onBreak" ? "ring-2 ring-yellow-400" :
                          "ring-2 ring-gray-400"
                        }`}
                        title={status.charAt(0).toUpperCase() + status.slice(1)}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showMembers && (
        <div
          ref={memberListRef}
          className="absolute top-16 left-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg p-4 w-64 z-50"
        >
          <h3 className="font-semibold mb-2 text-gray-800 dark:text-gray-100">Group Members</h3>
          <ul className="space-y-2 max-h-64 overflow-y-auto">
            {groupMemberProfiles.map((member) => {
              //const online = userStatuses[member.id!] || false;
              const status = userStatuses[member.id!] || "offline"; // "online" | "onBreak" | "offline"
              const statusColor =
                status === "online" ? "text-green-500" :
                status === "onBreak" ? "text-yellow-400" :
                "text-gray-500";

              const statusText =
                status === "online" ? "Online" :
                status === "onBreak" ? "On Break" :
                "Offline";
              return (
                <li key={member.id} className="flex items-center space-x-2">
                  <img
                    src={member.avatar || `https://avatars.dicebear.com/api/identicon/${member.id}.svg`}
                    alt={member.username}
                    className="w-6 h-6 rounded-full"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{member.username}</div>
                    {/* <div className={`text-xs ${online ? "text-green-500" : "text-gray-500"}`}>
                      {online ? "Online" : "Offline"}
                    </div> */}
                    <div className={`text-xs ${statusColor}`}>{statusText}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}



      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map(msg => {
          const isSender = msg.senderId === currentUserId;
          const displayName = msg.senderName;
          const displayAvatar = msg.senderAvatar;
          const unread = !msg.readBy?.[currentUserId] && !isSender;

          return (
            <div key={msg.id} className={`flex ${isSender ? "justify-end" : "justify-start"} items-end`}>
              <div className="relative">
                <img
                  src={displayAvatar || `https://avatars.dicebear.com/api/identicon/${msg.senderId}.svg`}
                  alt={displayName}
                  className={`w-8 h-8 rounded-full ${isSender ? "ml-2" : "mr-2"}`}
                />
                {/* Online/offline dot */}
                {isGroup && !isSender && (
                  <span
                    className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
                      userStatuses[msg.senderId] === "online" ? "bg-green-500" :
                      userStatuses[msg.senderId] === "onBreak" ? "bg-yellow-400" :
                      "bg-gray-400"
                    }`}
                    // title={userStatuses[msg.senderId]}
                    title={
                      (() => {
                        const status = userStatuses[msg.senderId];
                        const statusStr = typeof status === "string" ? status : (status ? "Online" : "Offline");
                        return statusStr.charAt(0).toUpperCase() + statusStr.slice(1);
                      })()
                    }
                  />
                )}
              </div>

              <div className="flex flex-col max-w-xs relative">
                <span className={`text-xs font-semibold mb-1 ${isSender ? "text-right" : "text-left"} text-gray-700 dark:text-gray-300`}>
                  {displayName}
                </span>
                <div className={`px-4 py-2 rounded-lg break-words ${isSender ? "bg-blue-500 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100"}`}
                     onClick={() => setSelectedMessageId(msg.id === selectedMessageId ? null : msg.id)}>
                  {msg.text.startsWith("https://api.dicebear.com/") ? (
                    <img src={msg.text} alt="DiceBear Avatar" className="rounded max-w-full" />
                  ) : (
                    <span>{parseEmojis(msg.text)}</span>
                  )}
                  {msg.imageUrl && <img src={msg.imageUrl} alt="sent image" className="mt-2 rounded max-w-full" />}
                </div>
                <span className="text-xs text-gray-500 mt-1 self-end">
                  {msg.timestamp?.toDate ? msg.timestamp.toDate().toLocaleTimeString() : ""}
                </span>

                {selectedMessageId === msg.id && (
                  <div ref={popupRef} className={`absolute ${isSender ? "right-0" : "left-0"} flex bg-white shadow-lg rounded-full p-1 z-50 -top-10`}>
                    {emojiReactions.map(emoji => (
                      <button key={emoji} className="text-lg px-1 hover:scale-125 transition-transform" onClick={() => toggleReaction(msg, emoji)}>
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}

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
          <button type="button" ref={emojiButtonRef} onClick={() => setShowEmojiPicker(prev => !prev)} className="mr-2 text-xl">😀</button>
          {showEmojiPicker && (
            <div ref={emojiPickerRef} className="absolute bottom-12 left-0 z-50 shadow-lg" style={{ minWidth: "280px" }}>
              <EmojiPicker onEmojiClick={handleEmojiClick} />
            </div>
          )}
          <label className="bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 px-3 py-2 rounded cursor-pointer text-sm">
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
