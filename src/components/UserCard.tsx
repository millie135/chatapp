"use client";
import { FC } from "react";

interface UserCardProps {
  userId: string;
  username: string;
  avatar?: string;
  onClick: (userId: string, username: string, avatar?: string) => void;
}

const UserCard: FC<UserCardProps> = ({ userId, username, avatar, onClick }) => {
  return (
    <div
      className="flex items-center p-3 bg-white rounded shadow cursor-pointer hover:bg-gray-100"
      onClick={() => onClick(userId, username, avatar)}
    >
      <img
        src={avatar || "/default-avatar.png"}
        alt={username}
        className="w-10 h-10 rounded-full mr-3"
      />
      <div>{username}</div>
    </div>
  );
};

export default UserCard;


/*rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    match /chats/{userId}/{otherUserId}/{messageId} {
      allow read, write: if request.auth != null &&
                          (request.auth.uid == userId || request.auth.uid == otherUserId);
    }

    match /users/{userId} {
      allow read: if request.auth != null;
      allow update: if request.auth.uid == userId;
      allow write: if false;
    }
  }
}*/

