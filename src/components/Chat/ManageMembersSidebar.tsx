import { UserType, Group } from "@/types";
import { useState } from "react";

interface Props {
  group: Group;
  users: UserType[];
  onAddMember: (memberId: string) => void;
  onRemoveMember: (memberId: string) => void;
  onClose: () => void;
}

export default function ManageMembersSidebar({ group, users, onAddMember, onRemoveMember, onClose }: Props) {
  const [members, setMembers] = useState(group.members);

  const availableUsers = users.filter(u => !members.includes(u.id));

  const handleAdd = (memberId: string) => {
    onAddMember(memberId);
    setMembers((prev) => [...prev, memberId]); // update local state immediately
  };

  const handleRemove = (memberId: string) => {
    onRemoveMember(memberId);
    setMembers((prev) => prev.filter(id => id !== memberId)); // update local state immediately
  };

  return (
    <div className="flex flex-col h-full w-full">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">{group.name} Members</h3>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors">✕</button>
      </div>

      {/* Current Members */}
      <div className="mb-6 bg-gray-50 dark:bg-gray-800 p-4 rounded-lg shadow-inner flex-1 overflow-y-auto">
        <h4 className="font-semibold mb-2 text-gray-700 dark:text-gray-200">Current Members</h4>
        {members.length === 0 ? (
          <p className="text-sm text-gray-500">No members yet.</p>
        ) : (
          <ul className="space-y-2">
            {members.map((memberId) => {
              const member = users.find(u => u.id === memberId);
              return member ? (
                <li key={member.id} className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <img src={member.avatar} alt={member.username} className="w-6 h-6 rounded-full object-cover" />
                    <span className="text-gray-800 dark:text-gray-100">{member.username}</span>
                  </div>
                  <button
                    className="px-2 py-0.5 bg-red-500 hover:bg-red-600 text-white rounded text-xs transition-colors"
                    onClick={() => handleRemove(member.id)}
                  >
                    Remove
                  </button>
                </li>
              ) : null;
            })}
          </ul>
        )}
      </div>

      {/* Add Members */}
      <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg shadow-inner flex-1 overflow-y-auto">
        <h4 className="font-semibold mb-2 text-gray-700 dark:text-gray-200">Add Members</h4>
        {availableUsers.length === 0 ? (
          <p className="text-sm text-gray-500">No available users to add.</p>
        ) : (
          <ul className="space-y-2">
            {availableUsers.map(u => (
              <li key={u.id} className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <img src={u.avatar} alt={u.username} className="w-6 h-6 rounded-full object-cover" />
                  <span className="text-gray-800 dark:text-gray-100">{u.username}</span>
                </div>
                <button
                  className="px-2 py-0.5 bg-green-500 hover:bg-green-600 text-white rounded text-xs transition-colors"
                  onClick={() => handleAdd(u.id)}
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

