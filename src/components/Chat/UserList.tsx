import React from "react";
import { UserType } from "@/types";
interface Props {
  users: UserType[];
  chatUser: any;
  unreadCounts: { [key: string]: number };
  userStatuses: { [key: string]: boolean };
  onSelectUser: (u: UserType) => void;
}

export default function UserList({ users, chatUser, unreadCounts, userStatuses, onSelectUser }: Props) {
  return (
    <div className="space-y-2">
      {users.map(u => (
        <button
          key={u.id}
          className={`flex items-center justify-between w-full px-3 py-2 rounded transition-colors ${
            chatUser?.id === u.id ? "bg-blue-500 text-white" : "hover:bg-gray-100 dark:hover:bg-gray-700"
          }`}
          onClick={() => onSelectUser(u)}
        >
          <div className="flex items-center space-x-2">
            <img src={u.avatar} alt={u.username} className="w-8 h-8 rounded-full" />
            <span className="font-medium">{u.username}</span>
          </div>
          <div className="flex items-center space-x-2">
            <span
              className={`w-3 h-3 rounded-full ${userStatuses[u.id] ? "bg-green-500" : "bg-gray-400"}`}
              title={userStatuses[u.id] ? "Online" : "Offline"}
            />
            {unreadCounts[u.id] > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                {unreadCounts[u.id]}
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
